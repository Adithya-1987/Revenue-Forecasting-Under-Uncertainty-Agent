"""Invent two years of CRM history plus ~150 open deals from planted "true" parameters.

The planted truth is the validation strategy: models fitted later must recover it.
Every stage change and close-date push is written to the event log, as a real CRM would.
Run: python -m engine.generate <workspace_id>      (wipes and reseeds that workspace)
"""
import math
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from engine.db import connect

# ---- hidden truth -----------------------------------------------------------
REPS = [  # id, name, team, true win multiplier (optimists < 1, sandbaggers > 1)
    ("R-1", "Priya Nair", "North", 1.15),
    ("R-2", "Meera Iyer", "North", 1.00),
    ("R-6", "Raj Sharma", "North", 0.78),
    ("R-3", "Arjun Rao", "South", 1.00),
    ("R-4", "Kabir Das", "South", 0.95),
    ("R-5", "Sana Khan", "South", 0.88),
]
SEGMENTS = {  # median value, base logit, planned cycle, slip (log ratio), payment terms, lateness median, share
    "SMB": dict(median=60_000, base=0.4, cycle=30, slip=0.05, terms=30, late=5, share=0.50),
    "Mid-Market": dict(median=220_000, base=0.0, cycle=60, slip=0.15, terms=45, late=8, share=0.33),
    "Enterprise": dict(median=600_000, base=-0.3, cycle=95, slip=0.30, terms=60, late=12, share=0.17),
}
STAGES = ["Qualify", "Demo", "Proposal", "Negotiation"]
STAGE_LOGIT = {"Qualify": -1.2, "Demo": -0.5, "Proposal": 0.3, "Negotiation": 1.1}
STAGE_WEIGHTS = [0.2, 0.3, 0.3, 0.2]
SILENT_PER_DAY = -0.06  # per silent day beyond 7, capped at 60
PUSH_LOGIT = -0.35
SIZE_LOGIT = -0.25  # per unit of log(value / segment median)
STUCK_PER_DAY = -0.015  # per day in the current stage beyond 30, capped at 90
AGE_PER_DAY = -0.003  # per day of deal age beyond 60, capped at 300
SIZE_CYCLE = 0.25  # planned cycle scales with (value / median) ** 0.25
LARGE_SLIP = 0.10  # deals above their segment median slip this much more (log ratio)
SEASON = {1: 0.9, 2: 0.95, 3: 1.45, 4: 0.8, 5: 0.9, 6: 1.1, 7: 0.9, 8: 0.9, 9: 1.15, 10: 1.0, 11: 0.95, 12: 1.3}
SLIP_SIGMA, LATE_SIGMA, NOISE_FLIP = 0.35, 0.6, 0.03
N_HISTORY, N_OPEN = 1800, 136
OBS_LAG = 21  # history features are recorded this many days before close

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


def true_logit(segment: str, stage: str, value: float, silent: int, pushes: int, stuck: int, age: int) -> float:
    s = SEGMENTS[segment]
    return (
        s["base"]
        + STAGE_LOGIT[stage]
        + SILENT_PER_DAY * min(max(silent - 7, 0), 60)
        + PUSH_LOGIT * pushes
        + SIZE_LOGIT * math.log(value / s["median"])
        + STUCK_PER_DAY * min(max(stuck - 30, 0), 90)
        + AGE_PER_DAY * min(max(age - 60, 0), 300)
    )


def seasonal_close(rng, closed: date) -> date:
    """Weak months lose some closes to the start of the next month (strong months keep theirs)."""
    keep = SEASON[closed.month] / max(SEASON.values())
    if rng.random() < keep:
        return closed
    nxt = (closed.replace(day=1) + timedelta(days=32)).replace(day=1)
    return nxt + timedelta(days=int(rng.integers(0, 10)))


def stage_path(rng, created: date, at: date, stage: str, stuck: int) -> list[tuple]:
    """Stage events from Qualify to `stage`: the last change is `stuck` days before `at`."""
    upto = STAGES.index(stage)
    last = max(created, at - timedelta(days=stuck))
    events = [(None, "Qualify", created)]
    for i in range(1, upto + 1):
        when = created + (last - created) * (i / upto) if upto else created
        events.append((STAGES[i - 1], STAGES[i], when))
    return events


def push_path(rng, created: date, at: date, first_close: date, pushes: int) -> tuple[list[tuple], date]:
    """Close-date events: each push moves the date 10-40 days later. Returns events and final date."""
    events, cur = [], first_close
    span = max((at - created).days, 1)
    for k in range(pushes):
        when = created + timedelta(days=int(span * (k + 1) / (pushes + 1)))
        new = cur + timedelta(days=int(rng.integers(10, 41)))
        events.append((cur, new, when))
        cur = new
    return events, cur


CUSTOMER_LATE_SIGMA = 0.5  # each customer's own payment habit: lateness x lognormal(0, 0.5), fixed per customer
COMMIT_NOISE = 0.12  # a rep's monthly commit = what they will close / true multiplier, give or take 12%
N_CUSTOMERS = {"SMB": 120, "Mid-Market": 60, "Enterprise": 25}
STORY_IDS = [f"S-{i + 1:02d}" for i in range(len(STORY))]  # scenario.py finds the story deals by these ids


def make_people(rng, people: dict | None):
    """Customers and reps: synthetic, or real ones (e.g. Aczen Nova clients and employees) with planted habits."""
    if people:
        customers = [dict(id=c["id"], name=c["name"], segment=c["segment"], terms=c["terms"]) for c in people["clients"]]
        mults = [r[3] for r in REPS]
        reps = [(r["id"], r["name"], r.get("team") or "Sales", mults[i % len(mults)]) for i, r in enumerate(people["reps"])]
    else:
        names = iter(f"{a} {b}" for a in PREFIX for b in SUFFIX)
        customers = [dict(id=f"C-{seg[:3].upper()}-{i:03d}", name=next(names, f"Customer {seg} {i}"), segment=seg,
                          terms=SEGMENTS[seg]["terms"]) for seg, k in N_CUSTOMERS.items() for i in range(k)]
        reps = list(REPS)
    for c in customers:
        c["late_mult"] = math.exp(rng.normal(0, CUSTOMER_LATE_SIGMA))
    return customers, reps


def make_data(as_of: date, seed: int = 7, people: dict | None = None):
    """Returns (deals, stage events, close-date events, customers, reps, rep commits)."""
    rng = np.random.default_rng(seed)
    customers, reps = make_people(rng, people)
    by_seg = {s: [c for c in customers if c["segment"] == s] or customers for s in SEGMENTS}
    seg_names = list(SEGMENTS)
    seg_p = [SEGMENTS[s]["share"] for s in seg_names]
    rep_mult = {r[0]: r[3] for r in reps}
    deals, stage_ev, close_ev, n = [], [], [], 0

    def new_id():
        nonlocal n
        n += 1
        return f"D-{n:04d}"

    def pick_customer(seg):
        group = by_seg[seg]
        return group[rng.integers(len(group))]

    for _ in range(N_HISTORY):
        seg = rng.choice(seg_names, p=seg_p)
        s = SEGMENTS[seg]
        cust = pick_customer(seg)
        rep = reps[rng.integers(len(reps))][0]
        value = round(s["median"] * math.exp(rng.normal(0, 0.6)), -3)
        created = as_of - timedelta(days=int(rng.integers(60, 760)))
        planned = max(7, round(s["cycle"] * (value / s["median"]) ** SIZE_CYCLE * math.exp(rng.normal(0, 0.25))))
        ratio = math.exp(rng.normal(s["slip"] + (LARGE_SLIP if value > s["median"] else 0), SLIP_SIGMA))
        closed = seasonal_close(rng, created + timedelta(days=max(10 + OBS_LAG, round(planned * ratio))))
        if closed >= as_of:
            continue
        obs = closed - timedelta(days=OBS_LAG)
        stage = rng.choice(STAGES, p=STAGE_WEIGHTS)
        silent = int(rng.exponential(9))
        stuck = min(int(rng.exponential(25)), max((obs - created).days, 0))
        pushes = int(max(0, round((ratio - 1) * 3))) + int(rng.poisson(0.2))
        age = (obs - created).days
        # days in stage exactly as the model will read it from the events (Qualify starts at creation)
        seen_stuck = age if stage == "Qualify" else (obs - max(created, obs - timedelta(days=stuck))).days
        p = min(0.97, sigmoid(true_logit(seg, stage, value, silent, pushes, seen_stuck, age)) * rep_mult[rep])
        won = rng.random() < p
        if rng.random() < NOISE_FLIP:  # irrational outcomes so the models are not perfect
            won = not won
        delay = cust["terms"] + s["late"] * cust["late_mult"] * math.exp(rng.normal(0, LATE_SIGMA)) - 2
        paid = closed + timedelta(days=max(1, round(delay))) if won else None
        did = new_id()
        pe, _ = push_path(rng, created, obs, created + timedelta(days=planned), pushes)
        stage_ev.extend((did, a, b, w) for a, b, w in stage_path(rng, created, obs, stage, stuck))
        stage_ev.append((did, stage, "Closed", closed))
        close_ev.extend((did, a, b, w) for a, b, w in pe)
        deals.append(dict(
            id=did, name=f"{cust['name']} #{n}", segment=seg, customer_id=cust["id"], terms=cust["terms"], rep=rep,
            value=value, stage=stage, status="won" if won else "lost", created_at=created,
            expected_close_date=created + timedelta(days=planned), last_activity_date=obs - timedelta(days=silent),
            push_count=pushes, closed_at=closed, paid_at=paid if paid and paid <= as_of else None,
        ))

    def open_deal(did, name, seg, value, stage, close_in, pushes, silent, rep, cust=None):
        cust = cust or pick_customer(seg)
        created = as_of - timedelta(days=int(rng.integers(20, 150)))
        stuck = min(int(rng.exponential(22)), (as_of - created).days)
        expected = as_of + timedelta(days=close_in)
        # the pushes already happened: work back from today's date to the first promised date
        first = expected - timedelta(days=25 * pushes)
        pe, _ = push_path(rng, created, as_of, first, pushes)
        if pe:  # align the last push with today's expected date
            a, _, w = pe[-1]
            pe[-1] = (a, expected, w)
        stage_ev.extend((did, a, b, w) for a, b, w in stage_path(rng, created, as_of, stage, stuck))
        close_ev.extend((did, a, b, w) for a, b, w in pe)
        return dict(
            id=did, name=name, segment=seg, customer_id=cust["id"], terms=cust["terms"], rep=rep, value=value, stage=stage,
            status="open", created_at=created, expected_close_date=expected, last_activity_date=as_of - timedelta(days=silent),
            push_count=pushes, closed_at=None, paid_at=None,
        )

    rep_ids = [r[0] for r in reps]
    for sid, (name, seg, value, stage, close_in, pushes, silent, rep) in zip(STORY_IDS, STORY):
        cust = pick_customer(seg)
        # with real people, story deals take a real client's name and a real rep (same roles, same week of events)
        label = f"{cust['name']} · {name}" if people else name
        story_rep = rep if rep in rep_mult else rep_ids[int(rep[2:]) % len(rep_ids)]
        deals.append(open_deal(sid, label, seg, value, stage, close_in, pushes, silent, story_rep, cust))
    for _ in range(N_OPEN):
        seg = rng.choice(seg_names, p=seg_p)
        s = SEGMENTS[seg]
        cust = pick_customer(seg)
        deals.append(open_deal(
            new_id(), f"{cust['name']} #{n}", seg, round(s["median"] * math.exp(rng.normal(0, 0.6)), -3),
            rng.choice(STAGES, p=STAGE_WEIGHTS), int(rng.integers(5, 110)),
            int(rng.poisson(0.4)), int(rng.exponential(8)), rep_ids[rng.integers(len(rep_ids))], cust,
        ))

    # each rep's monthly commit, made at the start of the month: what they will close, bent by their bias
    won_by = defaultdict(float)
    for d in deals:
        if d["status"] == "won":
            won_by[(d["rep"], d["closed_at"].replace(day=1))] += d["value"]
    commits = [(rep, month, (month + timedelta(days=32)).replace(day=1) - timedelta(days=1),
                round(actual / rep_mult[rep] * math.exp(rng.normal(0, COMMIT_NOISE)), -3))
               for (rep, month), actual in won_by.items()]
    return deals, stage_ev, close_ev, customers, reps, commits


def write_ground_truth(path: Path):
    lines = ["# Planted ground truth", "", "Models must recover these. Generated by `engine/generate.py`.", ""]
    lines += ["| Segment | Median value | Base logit | Planned cycle | Slip (log ratio) | Terms | Median lateness |", "|---|---|---|---|---|---|---|"]
    lines += [f"| {k} | {v['median']:,} | {v['base']} | {v['cycle']} d | {v['slip']} | {v['terms']} d | {v['late']} d |" for k, v in SEGMENTS.items()]
    lines += ["", "| Rep | Team | True win multiplier |", "|---|---|---|"] + [f"| {name} | {team} | {m} |" for _, name, team, m in REPS]
    lines += ["", f"Stage logits: {STAGE_LOGIT}",
              f"Silent: {SILENT_PER_DAY}/day beyond 7 · Push: {PUSH_LOGIT} · Size: {SIZE_LOGIT} per log(value/median)",
              f"Stuck in stage: {STUCK_PER_DAY}/day beyond 30 · Age: {AGE_PER_DAY}/day beyond 60",
              f"Cycle scales with (value/median)^{SIZE_CYCLE}; deals above median slip +{LARGE_SLIP} more",
              f"Seasonality (share of closes kept in month): {SEASON}",
              f"Noise: {NOISE_FLIP:.0%} of outcomes flipped · slip sigma {SLIP_SIGMA} · lateness sigma {LATE_SIGMA}", ""]
    path.write_text("\n".join(lines))


def wipe(cur, ws: str):
    """Remove one workspace's data, forecast history included (the only permitted delete)."""
    cur.execute("set local app.allow_reset = 'on'")
    runs = "(select id from forecast_runs where workspace_id = %s)"
    for t in ("forecast_attributions", "forecast_deal_snapshots", "forecast_results"):
        cur.execute(f"delete from {t} where run_id in {runs}", (ws,))
    for t in ("forecast_runs", "accuracy_reports", "stage_events", "closedate_events", "rep_forecasts", "invoice_payments",
              "deals", "customers", "salespeople", "targets"):
        cur.execute(f"delete from {t} where workspace_id = %s", (ws,))


def main(ws: str, as_of: date | None = None, people: dict | None = None):
    as_of = as_of or date.today() - timedelta(days=7)
    deals, stage_ev, close_ev, customers, reps, commits = make_data(as_of, people=people)
    with connect() as conn, conn.cursor() as cur:
        wipe(cur, ws)
        with cur.copy("copy salespeople (workspace_id, id, name, team, hire_date) from stdin") as cp:
            for rid, name, team, _ in reps:
                cp.write_row((ws, rid, name, team, as_of - timedelta(days=900)))
        with cur.copy("copy customers (workspace_id, id, name, segment, payment_terms_days) from stdin") as cp:
            for c in customers:
                cp.write_row((ws, c["id"], c["name"], c["segment"], c["terms"]))
        cols = ["workspace_id", "id", "name", "customer_id", "salesperson_id", "value", "stage", "status", "created_at",
                "expected_close_date", "last_activity_date", "push_count", "closed_at", "paid_at"]
        with cur.copy(f"copy deals ({', '.join(cols)}) from stdin") as cp:
            for d in deals:
                cp.write_row((ws, d["id"], d["name"], d["customer_id"], d["rep"], d["value"], d["stage"], d["status"],
                              d["created_at"], d["expected_close_date"], d["last_activity_date"], d["push_count"],
                              d["closed_at"], d["paid_at"]))
        with cur.copy("copy stage_events (workspace_id, deal_id, from_stage, to_stage, changed_at) from stdin") as cp:
            for e in stage_ev:
                cp.write_row((ws, *e))
        with cur.copy("copy closedate_events (workspace_id, deal_id, old_date, new_date, changed_at) from stdin") as cp:
            for e in close_ev:
                cp.write_row((ws, *e))
        with cur.copy("copy rep_forecasts (workspace_id, salesperson_id, period_start, period_end, committed) from stdin") as cp:
            for c in commits:
                cp.write_row((ws, *c))
    if not people:
        write_ground_truth(Path(__file__).resolve().parent.parent / "docs" / "ground_truth.md")
    n_open = sum(d["status"] == "open" for d in deals)
    print(f"seeded {len(deals)} deals ({n_open} open) for {len(customers)} customers and {len(reps)} reps; "
          f"{len(stage_ev)} stage and {len(close_ev)} close-date events; {len(commits)} rep commits; as of {as_of}")


if __name__ == "__main__":
    import sys
    main(sys.argv[1])
