"""One forecast run: models -> simulation -> immutable snapshot -> attribution vs the previous run.

Run: python -m engine.run --workspace <id> [--as-of YYYY-MM-DD]      prints {"run_id": ...} on the last line
"""
import argparse
import json
import math
from datetime import date

from psycopg.types.json import Jsonb

from engine.attribution import attribute, expected_total
from engine.db import connect
from engine.models import get_deal_inputs
from engine.sim import BASES, HORIZONS, expected_by_deal, simulate

SNAP_COLS = ["deal_id", "name", "value", "stage", "segment", "salesperson_id", "p_win", "p_win_low", "p_win_high",
             "calibration", "cycle_mu", "cycle_sigma", "payment_delay_days", "expected_close_date", "factors", "reasons",
             "slip_prob", "days_in_stage", "age_days", "slip_period_prob"]


def to_snapshot(d: dict) -> dict:
    """Rounded to the column precision, so recomputing from the database gives the same numbers."""
    return dict(
        deal_id=d["deal_id"], name=d["name"], value=round(d["value"], 2), stage=d["stage"], segment=d["segment"],
        salesperson_id=d["salesperson_id"], p_win=round(d["p_win"], 4), p_win_low=round(d["p_win_low"], 4),
        p_win_high=round(d["p_win_high"], 4), calibration=round(d["calibration"], 4), cycle_mu=round(d["cycle_mu"], 4),
        cycle_sigma=round(d["cycle_sigma"], 4), payment_delay_days=round(math.exp(d["payment_delay_mu"]), 2),
        expected_close_date=d["expected_close_date"], factors=d["factors"], reasons=d["reasons"],
        slip_prob=round(d["slip_prob"], 4), days_in_stage=d["days_in_stage"], age_days=d["age_days"],
        slip_period_prob=round(d["slip_period_prob"], 4),
    )


def load_snapshot(cur, run_id) -> list[dict]:
    cur.execute(f"select {', '.join(SNAP_COLS)} from forecast_deal_snapshots where run_id = %s", (run_id,))
    rows = [dict(zip(SNAP_COLS, r)) for r in cur.fetchall()]
    for r in rows:
        for k in ("value", "p_win", "p_win_low", "p_win_high", "calibration", "cycle_mu", "cycle_sigma", "payment_delay_days"):
            r[k] = float(r[k])
        for k in ("slip_prob", "slip_period_prob"):
            r[k] = float(r[k]) if r[k] is not None else None
    return rows


def cash_risk(inputs: list[dict], recv: list[dict], horizon: int) -> dict:
    """Revenue at risk of late collection: booked inside the window but paid after it, plus overdue invoices."""
    booked = expected_by_deal(inputs, horizon, "bookings")
    collected = expected_by_deal(inputs, horizon, "cash")
    gap = [(d["name"], float(b - c)) for d, b, c in zip(inputs, booked, collected) if b - c > 1]
    overdue = [r for r in recv if r["days_overdue"] > 0]
    top = sorted([dict(name=n, amount=round(a), kind="booked, paid later") for n, a in gap] +
                 [dict(name=r["name"], amount=round(r["value"]), kind=f"invoice {r['days_overdue']} days overdue") for r in overdue],
                 key=lambda x: -x["amount"])[:6]
    return dict(booked_paid_later=round(sum(a for _, a in gap)), overdue_receivables=round(sum(r["value"] for r in overdue)),
                overdue_count=len(overdue), top=top)


def concentration(inputs: list[dict], horizon: int, basis: str) -> dict:
    """How lumpy the window is: HHI, the equivalent number of equal deals, and what losing the biggest one costs."""
    e = expected_by_deal(inputs, horizon, basis)
    total = float(e.sum())
    if total <= 0:
        return dict(hhi=None, effective_deals=None, largest=None)
    share = e / total
    hhi = float((share ** 2).sum())
    i = int(e.argmax())
    return dict(hhi=round(hhi, 4), effective_deals=round(1 / hhi, 1),
                largest=dict(name=inputs[i]["name"], expected=round(float(e[i])), share=round(float(share[i]), 4)))


def main(as_of: date, ws: str) -> str:
    with connect() as conn, conn.cursor() as cur:
        inputs, recv, model = get_deal_inputs(conn, ws, as_of)
        if not inputs:
            raise SystemExit("No open deals to forecast. Upload a CSV with open deals, or use sample data.")
        snap = [to_snapshot(d) for d in inputs]

        cur.execute("select horizon_days, basis, amount from targets where workspace_id = %s", (ws,))
        targets = {(h, b): float(a) for h, b, a in cur.fetchall()}
        results = simulate(inputs, as_of, targets, recv, season=model["season"])
        if not targets:  # first run ever sets targets 10% above the median, rounded to 50k
            for (h, b), r in results.items():
                targets[(h, b)] = round(r["p50"] * 1.1 / 50_000) * 50_000
                cur.execute("insert into targets (workspace_id, horizon_days, basis, amount) values (%s, %s, %s, %s)", (ws, h, b, targets[(h, b)]))
            results = simulate(inputs, as_of, targets, recv, season=model["season"])

        cur.execute("select id, as_of from forecast_runs where workspace_id = %s order by run_at desc limit 1", (ws,))
        prev = cur.fetchone()
        cur.execute("insert into forecast_runs (workspace_id, as_of) values (%s, %s) returning id", (ws, as_of))
        run_id = cur.fetchone()[0]

        for (h, b), r in results.items():
            cur.execute(
                "insert into forecast_results (run_id, horizon_days, basis, p10, p50, p90, mean, expected, target, "
                "prob_hit_target, top3_share, hhi, top_deal, series, histogram, top_deals, cash_risk, concentration) "
                "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (run_id, h, b, r["p10"], r["p50"], r["p90"], r["mean"], round(expected_total(snap, as_of, h, b)),
                 r["target"], r["prob_hit_target"], r["top3_share"], r["hhi"], r["top_deal"],
                 Jsonb(r["series"]), Jsonb(r["histogram"]), Jsonb(r["top_deals"]), Jsonb(cash_risk(inputs, recv, h)), Jsonb(concentration(inputs, h, b))),
            )
        with cur.copy(f"copy forecast_deal_snapshots (run_id, {', '.join(SNAP_COLS)}) from stdin") as cp:
            for s in snap:
                cp.write_row([run_id] + [json.dumps(s[c]) if c in ("factors", "reasons") else s[c] for c in SNAP_COLS])

        if prev:
            prev_id, prev_as_of = prev
            prev_snap = load_snapshot(cur, prev_id)
            gone = [s["deal_id"] for s in prev_snap if s["deal_id"] not in {x["deal_id"] for x in snap}]
            cur.execute("select id, status from deals where workspace_id = %s and id = any(%s)", (ws, gone))
            status = dict(cur.fetchall())
            cur.execute("select id, name from salespeople where workspace_id = %s", (ws,))
            reps = dict(cur.fetchall())
            for h in HORIZONS:
                for b in BASES:
                    a = attribute(prev_snap, prev_as_of, snap, as_of, h, b, status, reps)
                    rows = a["causes"] + [dict(cause_type="interaction_residual", deal_id=None, deal_name=None,
                                               amount=a["residual"], description="What the fixed order could not assign")]
                    cur.executemany(
                        "insert into forecast_attributions (run_id, prev_run_id, horizon_days, basis, seq, cause_type, "
                        "deal_id, deal_name, amount, description) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        [(run_id, prev_id, h, b, seq, c["cause_type"], c["deal_id"], c["deal_name"], c["amount"], c["description"])
                         for seq, c in enumerate(rows)],
                    )
                    if (h, b) == (30, "bookings"):
                        print(f"30d bookings {a['prev_total']:,} -> {a['curr_total']:,}, residual {a['residual']:,}")
    r = results[(30, "bookings")]
    print(f"run {run_id} as of {as_of}: 30d bookings P10 {r['p10']:,} P50 {r['p50']:,} P90 {r['p90']:,}")
    print(json.dumps({"run_id": str(run_id)}))
    return str(run_id)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--workspace", required=True)
    ap.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    a = ap.parse_args()
    main(a.as_of, a.workspace)
