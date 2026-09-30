"""Invent two years of CRM history plus ~150 open deals from planted "true" parameters.

The planted truth is the validation strategy: models fitted later must recover it.
Run: python -m engine.generate <workspace_id>      (wipes and reseeds that workspace)
"""
import math
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from engine.db import connect

# ---- hidden truth -----------------------------------------------------------
REPS = [  # id, name, true win multiplier (optimists < 1, sandbaggers > 1)
    ("R-1", "Priya Nair", 1.15),
    ("R-2", "Meera Iyer", 1.00),
    ("R-3", "Arjun Rao", 1.00),
    ("R-4", "Kabir Das", 0.95),
    ("R-5", "Sana Khan", 0.88),
    ("R-6", "Raj Sharma", 0.78),
]
SEGMENTS = {  # median value, base logit, planned cycle days, slip (log ratio), pay delay days, share
    "SMB": dict(median=60_000, base=0.4, cycle=30, slip=0.05, pay=35, share=0.50),
    "Mid-Market": dict(median=220_000, base=0.0, cycle=60, slip=0.15, pay=45, share=0.33),
    "Enterprise": dict(median=600_000, base=-0.3, cycle=95, slip=0.30, pay=62, share=0.17),
}
STAGE_LOGIT = {"Qualify": -1.2, "Demo": -0.5, "Proposal": 0.3, "Negotiation": 1.1}
STAGE_WEIGHTS = [0.2, 0.3, 0.3, 0.2]
SILENT_PER_DAY = -0.06  # per silent day beyond 7, capped at 60
PUSH_LOGIT = -0.35
SIZE_LOGIT = -0.25  # per unit of log(value / segment median)
SLIP_SIGMA, PAY_SIGMA, NOISE_FLIP = 0.35, 0.30, 0.03
N_HISTORY, N_OPEN = 1800, 136

# Named open deals that carry the demo story (see scenario.py).
STORY = [  # name, segment, value, stage, close in days, pushes, silent days, rep
    ("Acme", "Enterprise", 500_000, "Proposal", 20, 2, 18, "R-6"),
    ("Globex", "Mid-Market", 300_000, "Demo", 25, 0, 6, "R-2"),
    ("Hooli", "Mid-Market", 210_000, "Proposal", 15, 0, 17, "R-3"),
    ("Soylent", "SMB", 120_000, "Proposal", 18, 0, 14, "R-3"),
    ("Tyrell", "Enterprise", 140_000, "Proposal", 22, 0, 21, "R-4"),
    ("Vandelay", "SMB", 90_000, "Negotiation", 12, 0, 15, "R-4"),
    ("Pied Piper", "Mid-Market", 260_000, "Proposal", 20, 1, 5, "R-6"),
    ("Cyberdyne", "Mid-Market", 180_000, "Negotiation", 14, 0, 4, "R-6"),
    ("Massive Dynamic", "Enterprise", 150_000, "Proposal", 26, 0, 3, "R-6"),
    ("Brightwater", "Mid-Market", 160_000, "Demo", 35, 0, 9, "R-6"),
    ("Kestrel Foods", "Mid-Market", 140_000, "Demo", 40, 0, 11, "R-6"),
    ("Wonka Industries", "Enterprise", 420_000, "Demo", 40, 0, 8, "R-2"),
    ("Stark Supply", "Enterprise", 300_000, "Negotiation", 10, 0, 2, "R-1"),
    ("Oscorp", "SMB", 75_000, "Proposal", 19, 1, 6, "R-2"),
    ("Northstar Logistics", "Enterprise", 1_600_000, "Negotiation", 25, 0, 3, "R-1"),  # huge
    ("Helios Grid", "Enterprise", 1_200_000, "Proposal", 50, 1, 7, "R-5"),  # huge
]

PREFIX = "Amber Birch Cobalt Delta Ember Falcon Granite Harbor Indigo Juniper Kite Lumen Maple Nimbus Orchid Pine Quartz Raven Sable Tidal Umber Vale Willow Zephyr".split()
SUFFIX = "Labs Foods Systems Logistics Health Retail Energy Textiles Media Works".split()


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def true_logit(segment: str, stage: str, value: float, silent: int, pushes: int) -> float:
    s = SEGMENTS[segment]
    return (
        s["base"]
        + STAGE_LOGIT[stage]
        + SILENT_PER_DAY * min(max(silent - 7, 0), 60)
        + PUSH_LOGIT * pushes
        + SIZE_LOGIT * math.log(value / s["median"])
    )


def make_data(as_of: date, seed: int = 7):
    rng = np.random.default_rng(seed)
    seg_names = list(SEGMENTS)
    seg_p = [SEGMENTS[s]["share"] for s in seg_names]
    rep_mult = {r[0]: r[2] for r in REPS}
    names = iter(f"{a} {b}" for a in PREFIX for b in SUFFIX)
    deals, n = [], 0

    def new_id():
        nonlocal n
        n += 1
        return f"D-{n:04d}"

    # history: features are observed 21 days before close (the convention models.py reads)
    for _ in range(N_HISTORY):
        seg = rng.choice(seg_names, p=seg_p)
        s = SEGMENTS[seg]
        rep = REPS[rng.integers(len(REPS))][0]
        value = round(s["median"] * math.exp(rng.normal(0, 0.6)), -3)
        created = as_of - timedelta(days=int(rng.integers(60, 760)))
        planned = max(7, round(s["cycle"] * math.exp(rng.normal(0, 0.25))))
        ratio = math.exp(rng.normal(s["slip"], SLIP_SIGMA))
        closed = created + timedelta(days=max(10, round(planned * ratio)))
        if closed >= as_of:
            continue
        stage = rng.choice(list(STAGE_LOGIT), p=STAGE_WEIGHTS)
        silent = int(rng.exponential(9))
        pushes = int(max(0, round((ratio - 1) * 3))) + int(rng.poisson(0.2))
        p = min(0.97, sigmoid(true_logit(seg, stage, value, silent, pushes)) * rep_mult[rep])
        won = rng.random() < p
        if rng.random() < NOISE_FLIP:  # irrational outcomes so the models are not perfect
            won = not won
        obs = closed - timedelta(days=21)
        paid = closed + timedelta(days=round(s["pay"] * math.exp(rng.normal(0, PAY_SIGMA)))) if won else None
        deals.append(dict(
            id=new_id(), name=f"Account {n}", segment=seg, rep=rep, value=value, stage=stage,
            status="won" if won else "lost", created_at=created, expected_close_date=created + timedelta(days=planned),
            last_activity_date=obs - timedelta(days=silent), push_count=pushes, closed_at=closed,
            paid_at=paid if paid and paid <= as_of else None,
        ))

    def open_deal(name, seg, value, stage, close_in, pushes, silent, rep):
        return dict(
            id=new_id(), name=name, segment=seg, rep=rep, value=value, stage=stage, status="open",
            created_at=as_of - timedelta(days=int(rng.integers(20, 150))),
            expected_close_date=as_of + timedelta(days=close_in), last_activity_date=as_of - timedelta(days=silent),
            push_count=pushes, closed_at=None, paid_at=None,
        )

    for row in STORY:
        deals.append(open_deal(*row))
    for _ in range(N_OPEN):
        seg = rng.choice(seg_names, p=seg_p)
        s = SEGMENTS[seg]
        deals.append(open_deal(
            next(names), seg, round(s["median"] * math.exp(rng.normal(0, 0.6)), -3),
            rng.choice(list(STAGE_LOGIT), p=STAGE_WEIGHTS), int(rng.integers(5, 110)),
            int(rng.poisson(0.4)), int(rng.exponential(8)), REPS[rng.integers(len(REPS))][0],
        ))
    return deals


def write_ground_truth(path: Path):
    lines = ["# Planted ground truth", "", "Models must recover these. Generated by `engine/generate.py`.", ""]
    lines += ["| Segment | Median value | Base logit | Planned cycle | Slip (log ratio) | Pay delay |", "|---|---|---|---|---|---|"]
    lines += [f"| {k} | {v['median']:,} | {v['base']} | {v['cycle']} d | {v['slip']} | {v['pay']} d |" for k, v in SEGMENTS.items()]
    lines += ["", "| Rep | True win multiplier |", "|---|---|"] + [f"| {name} | {m} |" for _, name, m in REPS]
    lines += ["", f"Stage logits: {STAGE_LOGIT}", f"Silent: {SILENT_PER_DAY}/day beyond 7 · Push: {PUSH_LOGIT} · Size: {SIZE_LOGIT} per log(value/median)",
              f"Noise: {NOISE_FLIP:.0%} of outcomes flipped · slip sigma {SLIP_SIGMA} · pay sigma {PAY_SIGMA}", ""]
    path.write_text("\n".join(lines))


def wipe(cur, ws: str):
    """Remove one workspace's data, forecast history included (the only permitted delete)."""
    cur.execute("set local app.allow_reset = 'on'")
    runs = "(select id from forecast_runs where workspace_id = %s)"
    for t in ("forecast_attributions", "forecast_deal_snapshots", "forecast_results"):
        cur.execute(f"delete from {t} where run_id in {runs}", (ws,))
    for t in ("forecast_runs", "accuracy_reports", "deals", "customers", "salespeople", "targets"):
        cur.execute(f"delete from {t} where workspace_id = %s", (ws,))


def main(ws: str, as_of: date | None = None):
    as_of = as_of or date.today() - timedelta(days=7)
    deals = make_data(as_of)
    with connect() as conn, conn.cursor() as cur:
        wipe(cur, ws)
        with cur.copy("copy salespeople (workspace_id, id, name, team, hire_date) from stdin") as cp:
            for rid, name, _ in REPS:
                cp.write_row((ws, rid, name, "Direct", as_of - timedelta(days=900)))
        with cur.copy("copy customers (workspace_id, id, name, segment, payment_terms_days) from stdin") as cp:
            for d in deals:
                cp.write_row((ws, "C-" + d["id"][2:], d["name"], d["segment"], 30))
        cols = ["workspace_id", "id", "name", "customer_id", "salesperson_id", "value", "stage", "status", "created_at",
                "expected_close_date", "last_activity_date", "push_count", "closed_at", "paid_at"]
        with cur.copy(f"copy deals ({', '.join(cols)}) from stdin") as cp:
            for d in deals:
                cp.write_row((ws, d["id"], d["name"], "C-" + d["id"][2:], d["rep"], d["value"], d["stage"], d["status"],
                              d["created_at"], d["expected_close_date"], d["last_activity_date"], d["push_count"],
                              d["closed_at"], d["paid_at"]))
    write_ground_truth(Path(__file__).resolve().parent.parent / "docs" / "ground_truth.md")
    n_open = sum(d["status"] == "open" for d in deals)
    print(f"seeded {len(deals)} deals ({n_open} open) as of {as_of}")


if __name__ == "__main__":
    import sys
    main(sys.argv[1])
