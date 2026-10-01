"""Monte Carlo range (P10/P50/P90, chance of target) and the exact expected value attribution walks.

Deal timing is drawn in business days and turned into calendar days on the seasonal clock (engine/season.py).
"""
import math
from datetime import date, timedelta

import numpy as np
from scipy.stats import norm

from engine.season import Season

HORIZONS = (30, 60, 90)
BASES = ("bookings", "cash")
TRIALS = 10_000


def expected_by_deal(deals: list[dict], horizon: int, basis: str, as_of: date | None = None,
                     season: Season | None = None) -> np.ndarray:
    """E[revenue in window] per deal = value * p_win * P(lands within horizon). Exact, no noise.

    Cash uses the median payment delay as a fixed shift so the value stays closed-form. Without a season
    (or as_of) the clock is the calendar.
    """
    out = np.zeros(len(deals))
    for i, d in enumerate(deals):
        window = horizon - (math.exp(d["payment_delay_mu"]) if basis == "cash" else 0)
        if window > 0:
            business = float(season.ahead(as_of, window)) if season and as_of else window
            out[i] = d["value"] * d["p_win"] * norm.cdf((math.log(business) - d["cycle_mu"]) / d["cycle_sigma"])
    return out


def simulate(deals: list[dict], as_of: date, targets: dict, receivables: list[dict] = (), seed: int = 42,
             season: Season | None = None) -> dict:
    """Returns {(horizon, basis): result} with the Forecast API fields (minus as_of).

    receivables (won, unpaid) add to cash only: they are already booked.
    """
    season = season or Season()
    rng = np.random.default_rng(seed)
    n = len(deals)
    value = np.array([d["value"] for d in deals])
    p = np.array([d["p_win"] for d in deals])
    mu = np.array([d["cycle_mu"] for d in deals])
    sig = np.array([d["cycle_sigma"] for d in deals])
    dmu = np.array([d["payment_delay_mu"] for d in deals])
    dsig = np.array([d["payment_delay_sigma"] for d in deals])

    win = rng.random((TRIALS, n)) < p
    close_days = season.calendar(as_of, np.exp(mu + sig * rng.standard_normal((TRIALS, n))))
    cash_days = close_days + np.exp(dmu + dsig * rng.standard_normal((TRIALS, n)))
    landed = {"bookings": close_days, "cash": cash_days}
    r_value = np.array([r["value"] for r in receivables])
    r_days = np.exp(np.array([r["mu"] for r in receivables]) + np.array([r["sigma"] for r in receivables])
                    * rng.standard_normal((TRIALS, len(receivables))))
    collected = lambda h: (r_days <= h) @ r_value if len(r_value) else 0  # noqa: E731

    results = {}
    for basis in BASES:
        for h in HORIZONS:
            totals = (win & (landed[basis] <= h)) @ value + (collected(h) if basis == "cash" else 0)
            p10, p50, p90 = np.percentile(totals, [10, 50, 90])
            series = []
            for day in range(0, h + 1, 5):
                q = np.percentile((win & (landed[basis] <= day)) @ value + (collected(day) if basis == "cash" else 0),
                                  [10, 25, 50, 75, 90]) if day else [0] * 5
                series.append(dict(date=str(as_of + timedelta(days=day)), p10=round(q[0]), p25=round(q[1]),
                                   p50=round(q[2]), p75=round(q[3]), p90=round(q[4])))
            counts, edges = np.histogram(totals, bins=40)
            e = expected_by_deal(deals, h, basis, as_of, season)
            share = e / e.sum() if e.sum() else e
            damage = value * (1 - p) * (share > 0)
            target = targets.get((h, basis))
            results[(h, basis)] = dict(
                horizon=h, basis=basis, p10=round(p10), p50=round(p50), p90=round(p90), mean=round(totals.mean()),
                expected=round(e.sum()), target=target,
                prob_hit_target=round(float((totals >= target).mean()), 4) if target else None,
                top3_share=round(float(np.sort(share)[-3:].sum()), 4), hhi=round(float((share ** 2).sum()), 4),
                top_deal=deals[int(damage.argmax())]["name"] if n else None,
                top_deals=[dict(name=deals[i]["name"], share=round(float(share[i]), 4)) for i in np.argsort(share)[::-1][:3] if share[i] > 0],
                series=series, histogram=[dict(bin=round(edges[i]), count=int(c)) for i, c in enumerate(counts)],
            )
    return results
