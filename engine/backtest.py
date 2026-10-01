"""Rewind to 12 past dates, forecast with only what was known then, compare with what closed.

Writes the Trust screen's Accuracy report. Run: python -m engine.backtest --workspace <id> [--as-of YYYY-MM-DD]
"""
import argparse
from datetime import date, timedelta

import numpy as np
from psycopg.types.json import Jsonb

from engine.db import connect
from engine.models import OBS_LAG, deal_inputs, fit, load_deals
from engine.sim import simulate

NAIVE = {"Qualify": 0.10, "Demo": 0.25, "Proposal": 0.50, "Negotiation": 0.75}  # the stage-% method we replace


def as_seen_at(d: dict, t: date) -> dict:
    """History features are recorded at close - 21d; replay the same silence and time in stage at date t."""
    obs = d["closed_at"] - OBS_LAG
    return dict(d, last_activity_date=t - (obs - d["last_activity_date"]),
                stage_entered_at=max(t - max(obs - d["stage_entered_at"], timedelta(0)), d["created_at"]))


def report(deals: list[dict], as_of: date, points: int = 12) -> dict:
    closed = [d for d in deals if d["status"] != "open" and d["closed_at"] <= as_of]
    rows, errs, naive_errs = [], {30: [], 60: [], 90: []}, []
    for k in range(points, 0, -1):
        t = as_of - timedelta(days=30 * k + 60)
        known = [d for d in closed if d["closed_at"] <= t]
        open_t = [as_seen_at(d, t) for d in closed if d["created_at"] <= t < d["closed_at"]]
        if len(known) < 200 or not open_t:
            continue
        model = fit(known, t, bootstrap=0)
        res = simulate(deal_inputs(model, open_t, t), t, {}, season=model["season"])
        for h in (30, 60, 90):
            actual = sum(d["value"] for d in open_t if d["status"] == "won" and d["closed_at"] <= t + timedelta(days=h))
            if actual:
                errs[h].append((res[(h, "bookings")]["p50"] - actual) / actual)
        r, actual30 = res[(30, "bookings")], sum(
            d["value"] for d in open_t if d["status"] == "won" and d["closed_at"] <= t + timedelta(days=30))
        naive = sum(d["value"] * NAIVE[d["stage"]] for d in open_t if d["expected_close_date"] <= t + timedelta(days=30))
        if actual30:
            naive_errs.append(abs(naive - actual30) / actual30)
        rows.append(dict(run_at=f"{t:%Y-%m}", predicted=r["p50"], actual=round(actual30), p10=r["p10"], p90=r["p90"]))

    # Rep scoreboard: "committed" = what a neutral rep would have closed on the same deals (the model),
    # score = the shrunk calibration factor the forecast actually applies.
    full = fit(closed, as_of, bootstrap=0)
    reps = []
    for rep in sorted({d["salesperson_id"] for d in closed}):
        mine = [i for i, d in enumerate(closed) if d["salesperson_id"] == rep]
        committed = sum(closed[i]["value"] * full["p_hist"][i] for i in mine)
        actual = sum(closed[i]["value"] for i in mine if closed[i]["status"] == "won")
        score = full["cal"][rep]
        reps.append(dict(id=rep, committed=round(committed), actual=round(actual), score=round(score, 2),
                         label="optimist" if score < 0.9 else "sandbagger" if score > 1.1 else "calibrated"))

    return dict(
        mape={str(h): round(float(np.mean(np.abs(e))), 4) if e else None for h, e in errs.items()},
        bias=round(float(np.mean(errs[30])), 4) if errs[30] else 0,
        coverage=round(float(np.mean([r["p10"] <= r["actual"] <= r["p90"] for r in rows])), 4) if rows else None,
        baseline_mape=round(float(np.mean(naive_errs)), 4) if naive_errs else None,
        history=rows, reps=reps,
    )


def main(as_of: date, ws: str):
    with connect() as conn, conn.cursor() as cur:
        rep = report(load_deals(conn, ws), as_of)
        cur.execute("select id, name from salespeople where workspace_id = %s", (ws,))
        names = dict(cur.fetchall())
        for r in rep["reps"]:
            r["name"] = names.get(r["id"], r["id"])
        cur.execute("insert into accuracy_reports (workspace_id, report) values (%s, %s)", (ws, Jsonb(rep)))
    print(f"backtest: mape {rep['mape']}, coverage {rep['coverage']}, naive {rep['baseline_mape']}, points {len(rep['history'])}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--workspace", required=True)
    ap.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    a = ap.parse_args()
    main(a.as_of, a.workspace)
