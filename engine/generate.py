"""Invent two years of CRM history plus ~150 open deals from planted "true" parameters.

The planted truth is the validation strategy: models fitted later must recover it.
Run: python -m engine.generate <workspace_id>      (wipes and reseeds that workspace)
"""
import math
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from engine.db import connect
from engine.season import YEAR, Season

# ---- hidden truth -----------------------------------------------------------
REPS = [  # id, name, true win multiplier (optimists < 1, sandbaggers > 1)
    ("R-1", "Priya Nair", 1.15),
    ("R-2", "Meera Iyer", 1.00),
    ("R-3", "Arjun Rao", 1.00),
    ("R-4", "Kabir Das", 0.95),
    ("R-5", "Sana Khan", 0.88),
    ("R-6", "Raj Sharma", 0.78),
]
TEAMS = {"R-1": "North", "R-2": "North", "R-3": "North", "R-4": "South", "R-5": "South", "R-6": "South"}
TERMS = {  # payment terms offered per segment (days) and how often
    "SMB": ([15, 30, 45], [0.3, 0.5, 0.2]),
    "Mid-Market": ([30, 45, 60], [0.3, 0.5, 0.2]),
    "Enterprise": ([45, 60, 90], [0.3, 0.5, 0.2]),
}
SEGMENTS = {  # median value, base logit, planned cycle days, slip (log ratio), late payment (log delay/terms), share
    "SMB": dict(median=60_000, base=0.4, cycle=30, slip=0.05, late=0.15, share=0.50),
    "Mid-Market": dict(median=220_000, base=0.0, cycle=60, slip=0.15, late=0.05, share=0.33),
    "Enterprise": dict(median=600_000, base=-0.3, cycle=95, slip=0.30, late=0.10, share=0.17),
}
STAGE_LOGIT = {"Qualify": -1.2, "Demo": -0.5, "Proposal": 0.3, "Negotiation": 1.1}
STAGE_WEIGHTS = [0.2, 0.3, 0.3, 0.2]
SILENT_PER_DAY = -0.06  # per silent day beyond 7, capped at 60
PUSH_LOGIT = -0.35
SIZE_LOGIT = -0.25  # per unit of log(value / segment median)
AGE_LOGIT = -0.5  # per unit of log(age / segment cycle), once a deal is older than its segment's cycle
STALL_PER_DAY = -0.025  # per day in the current stage beyond 21, capped at 60
STAGE_DAYS = 18  # mean days a deal has sat in its current stage when observed
SIZE_SLIP = 0.15  # per unit of log(value / segment median): big deals overrun their plan more
# Close-rate index by month, Jan..Dec: March fiscal year end, quarter ends strong; April-May slow.
SEASON = [0.95, 1.0, 1.5, 0.7, 0.8, 1.15, 0.85, 0.9, 1.2, 0.95, 0.9, 1.1]
TRUE_SEASON = Season([x / (np.dot(SEASON, YEAR) / 365) for x in SEASON])
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


def true_logit(segment: str, stage: str, value: float, silent: int, pushes: int, age: int, stage_days: int) -> float:
    s = SEGMENTS[segment]
    return (
        s["base"]
        + STAGE_LOGIT[stage]
        + SILENT_PER_DAY * min(max(silent - 7, 0), 60)
        + PUSH_LOGIT * pushes
        + SIZE_LOGIT * math.log(value / s["median"])
        + AGE_LOGIT * max(math.log(max(age, 1) / s["cycle"]), 0)
        + STALL_PER_DAY * min(max(stage_days - 21, 0), 60)
    )


def make_data(as_of: date, seed: int = 7):
    rng = np.random.default_rng(seed)
    rng2 = np.random.default_rng(seed + 100)  # stage clocks and payment terms

    def stage_clock(stage: str, age: int) -> int:
        """Days in the current stage when observed: since creation for Qualify, else a draw no longer than the deal's age."""
        return age if stage == "Qualify" else min(int(rng2.exponential(STAGE_DAYS)), age)

    def terms(seg: str) -> int:
        days, w = TERMS[seg]
        return int(rng2.choice(days, p=w))

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
        # the work takes planned x ratio business days; the seasonal clock turns that into a calendar close date
        ratio = math.exp(rng.normal(s["slip"] + SIZE_SLIP * math.log(value / s["median"]), SLIP_SIGMA))
        closed = created + timedelta(days=max(10, round(float(TRUE_SEASON.calendar(created, planned * ratio)))))
        if closed >= as_of:
            continue
        stage = rng.choice(list(STAGE_LOGIT), p=STAGE_WEIGHTS)
        silent = int(rng.exponential(9))
        pushes = int(max(0, round((ratio - 1) * 3))) + int(rng.poisson(0.2))
        obs = closed - timedelta(days=21)
        age = max((obs - created).days, 1)
        in_stage = stage_clock(stage, age)
        p = min(0.97, sigmoid(true_logit(seg, stage, value, silent, pushes, age, in_stage)) * rep_mult[rep])
        won = rng.random() < p
        if rng.random() < NOISE_FLIP:  # irrational outcomes so the models are not perfect
            won = not won
        net = terms(seg)
        paid = closed + timedelta(days=round(net * math.exp(rng.normal(s["late"], PAY_SIGMA)))) if won else None
        deals.append(dict(
            id=new_id(), name=f"Account {n}", segment=seg, rep=rep, value=value, stage=stage,
            status="won" if won else "lost", created_at=created, expected_close_date=created + timedelta(days=planned),
            last_activity_date=obs - timedelta(days=silent), push_count=pushes, closed_at=closed,
            paid_at=paid if paid and paid <= as_of else None, terms=net,
            stage_entered_at=max(obs - timedelta(days=in_stage), created),  # quick deals are observed before they began
        ))

    def open_deal(name, seg, value, stage, close_in, pushes, silent, rep):
        created = as_of - timedelta(days=int(rng.integers(20, 150)))
        return dict(
            id=new_id(), name=name, segment=seg, rep=rep, value=value, stage=stage, status="open",
            created_at=created, expected_close_date=as_of + timedelta(days=close_in),
            last_activity_date=as_of - timedelta(days=silent), push_count=pushes, closed_at=None, paid_at=None,
            terms=terms(seg), stage_entered_at=as_of - timedelta(days=stage_clock(stage, (as_of - created).days)),
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


def histories(deals: list[dict], as_of: date, seed: int = 11) -> list[tuple]:
    """Stage path, date pushes and outcome for every deal, as deal_events rows.

    A separate random stream, so adding history leaves the deals themselves unchanged. Stages are climbed
    one at a time from Qualify; the earlier steps fall at random points after creation and the last one on
    the deal's stage_entered_at. Each date push moves the close date later; the last push lands on the close
    date the deal carries now. Returns rows of (deal_id, at, kind, from_value, to_value).
    """
    rng = np.random.default_rng(seed)
    stages = list(STAGE_LOGIT)
    events = []
    for d in deals:
        seen = as_of if d["status"] == "open" else max(d["closed_at"] - timedelta(days=21), d["created_at"])
        span = max((seen - d["created_at"]).days, 1)
        k = stages.index(d["stage"])
        events.append((d["id"], d["created_at"], "created", None, stages[0]))
        if k:
            last = (d["stage_entered_at"] - d["created_at"]).days
            steps = sorted(int(x) for x in rng.integers(0, last + 1, k - 1)) + [last]
            for i, days in enumerate(steps, start=1):
                events.append((d["id"], d["created_at"] + timedelta(days=days), "stage", stages[i - 1], stages[i]))

        close = d["expected_close_date"]
        moves = sorted((int(x) for x in rng.integers(1, span + 1, d["push_count"])), reverse=True)
        for days in moves:  # walk back from today's close date: each push added 10-30 days
            earlier = max(close - timedelta(days=int(rng.integers(10, 31))), d["created_at"] + timedelta(days=14))
            if earlier >= close:
                continue
            events.append((d["id"], d["created_at"] + timedelta(days=days), "close_date", str(earlier), str(close)))
            close = earlier
        if d["status"] != "open":
            events.append((d["id"], d["closed_at"], "status", "open", d["status"]))
    return sorted(events, key=lambda e: (e[0], e[1]))


def write_ground_truth(path: Path):
    lines = ["# Planted ground truth", "", "Models must recover these. Generated by `engine/generate.py`.", ""]
    lines += ["| Segment | Median value | Base logit | Planned cycle | Slip (log ratio) | Late payment (log delay/terms) | Terms offered |",
              "|---|---|---|---|---|---|---|"]
    lines += [f"| {k} | {v['median']:,} | {v['base']} | {v['cycle']} d | {v['slip']} | {v['late']} | "
              f"{' / '.join(f'{t} d' for t in TERMS[k][0])} |" for k, v in SEGMENTS.items()]
    lines += ["", "| Rep | Team | True win multiplier |", "|---|---|---|"] + [f"| {name} | {TEAMS[r]} | {m} |" for r, name, m in REPS]
    months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    lines += ["", "Seasonality (close-rate index): " + ", ".join(f"{m} {x:.2f}" for m, x in zip(months, TRUE_SEASON.index))]
    lines += ["", f"Stage logits: {STAGE_LOGIT}", f"Silent: {SILENT_PER_DAY}/day beyond 7 · Push: {PUSH_LOGIT} · Size: {SIZE_LOGIT} per log(value/median)",
              f"Age: {AGE_LOGIT} per log(age/segment cycle) beyond 1 · Stalled: {STALL_PER_DAY}/day in stage beyond 21 (cap 60)",
              f"Cycle overrun: slip + {SIZE_SLIP} per log(value/median), measured on the seasonal clock",
              f"Noise: {NOISE_FLIP:.0%} of outcomes flipped · slip sigma {SLIP_SIGMA} · pay sigma {PAY_SIGMA}", ""]
    path.write_text("\n".join(lines), encoding="utf-8")


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
    events = histories(deals, as_of)
    with connect() as conn, conn.cursor() as cur:
        wipe(cur, ws)
        cur.execute("set local app.deal_log = 'off'")  # full histories are written below, not by the trigger
        with cur.copy("copy salespeople (workspace_id, id, name, team, hire_date) from stdin") as cp:
            for rid, name, _ in REPS:
                cp.write_row((ws, rid, name, TEAMS[rid], as_of - timedelta(days=900)))
        with cur.copy("copy customers (workspace_id, id, name, segment, payment_terms_days) from stdin") as cp:
            for d in deals:
                cp.write_row((ws, "C-" + d["id"][2:], d["name"], d["segment"], d["terms"]))
        cols = ["workspace_id", "id", "name", "customer_id", "salesperson_id", "value", "stage", "status", "created_at",
                "expected_close_date", "last_activity_date", "push_count", "closed_at", "paid_at", "stage_entered_at"]
        with cur.copy(f"copy deals ({', '.join(cols)}) from stdin") as cp:
            for d in deals:
                cp.write_row((ws, d["id"], d["name"], "C-" + d["id"][2:], d["rep"], d["value"], d["stage"], d["status"],
                              d["created_at"], d["expected_close_date"], d["last_activity_date"], d["push_count"],
                              d["closed_at"], d["paid_at"], d["stage_entered_at"]))
        with cur.copy("copy deal_events (workspace_id, deal_id, at, kind, from_value, to_value, source) from stdin") as cp:
            for e in events:
                cp.write_row((ws, *e, "sample"))
        cur.execute("set local app.deal_log = 'on'")
    write_ground_truth(Path(__file__).resolve().parent.parent / "docs" / "ground_truth.md")
    n_open = sum(d["status"] == "open" for d in deals)
    print(f"seeded {len(deals)} deals ({n_open} open) as of {as_of}")


if __name__ == "__main__":
    import sys
    main(sys.argv[1])
