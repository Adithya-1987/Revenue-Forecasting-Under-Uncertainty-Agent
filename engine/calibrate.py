"""Measure range quality (backtest coverage and bias) on several generated companies, offline.

Run: python -m engine.calibrate            prints coverage and bias per setting
Coverage = share of past 30-day actuals inside P10-P90 (goal ~80%); bias = mean (forecast - actual) / actual.
"""
from collections import defaultdict
from datetime import date

import numpy as np

import engine.sim as sim
from engine.backtest import report
from engine.generate import REPS, make_data


def company(seed: int, as_of: date) -> list[dict]:
    deals, stage_ev, *_ = make_data(as_of, seed=seed)
    dates = defaultdict(list)
    for did, _, to, when in stage_ev:
        if to != "Closed":
            dates[did].append(when)
    team = {r[0]: r[2] for r in REPS}
    for d in deals:
        d.update(salesperson_id=d["rep"], team=team[d["rep"]], stage_dates=sorted(dates[d["id"]]))
    return deals


def score(seeds=(7, 11, 23), as_of=date(2026, 10, 1)) -> tuple[float, float, float]:
    cov, bias, mape = [], [], []
    for seed in seeds:
        r = report(company(seed, as_of), as_of)
        cov.append(r["coverage"]), bias.append(r["bias"]), mape.append(r["mape"]["30"])
    return float(np.mean(cov)), float(np.mean(bias)), float(np.mean(mape))


if __name__ == "__main__":
    import sys
    configs = {
        "no seasonality, no uncertainty": dict(SEASON_DEFER=False, PARAM_UNCERTAINTY=False, SHOCK_SD=0.0),
        "seasonal reweight": dict(SEASON_DEFER=True, SEASON_MODE="reweight", PARAM_UNCERTAINTY=False, SHOCK_SD=0.0),
        "reweight + uncertainty": dict(SEASON_DEFER=True, SEASON_MODE="reweight", PARAM_UNCERTAINTY=True, SHOCK_SD=0.0),
        "reweight + uncertainty + shock 0.15": dict(SEASON_DEFER=True, SEASON_MODE="reweight", PARAM_UNCERTAINTY=True, SHOCK_SD=0.15),
        "reweight + uncertainty + shock 0.25": dict(SEASON_DEFER=True, SEASON_MODE="reweight", PARAM_UNCERTAINTY=True, SHOCK_SD=0.25),
        "reweight + uncertainty + shock 0.35": dict(SEASON_DEFER=True, SEASON_MODE="reweight", PARAM_UNCERTAINTY=True, SHOCK_SD=0.35),
    }
    only = sys.argv[1:] and set(sys.argv[1:])
    for name, cfg in configs.items():
        if only and name not in only:
            continue
        for k, v in cfg.items():
            setattr(sim, k, v)
        c, b, m = score()
        print(f"{name:38s} coverage {c:.0%}  bias {b:+.1%}  30d error {m:.1%}")
