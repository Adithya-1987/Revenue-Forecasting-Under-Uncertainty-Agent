"""Monte Carlo range (P10/P50/P90, chance of target) and the exact expected value attribution walks."""
import math
from datetime import date, timedelta

import numpy as np
from scipy.stats import norm

HORIZONS = (30, 60, 90)
BASES = ("bookings", "cash")
TRIALS = 10_000
# Range realism (tuned against the backtest's coverage; see engine/calibrate.py):
SEASON_MODE = "reweight"  # "reweight": close dates drawn in proportion to each month's strength (no net delay);
#                           "defer": weak-month closes move to next month (double-counts delays already in cycle data)
SEASON_DEFER = True  # kept for engine/calibrate.py comparisons
PARAM_UNCERTAINTY = True  # each trial draws each deal's win chance from its own uncertainty band
SHOCK_SD = 0.15  # one market-wide swing per trial on every deal's log-odds: deals are not independent
# calibrate.py on 3 companies: coverage 75% (goal 70-90%), bias +5%; the old median nudge gave 58-83%, bias -10 to -28%


def _logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def expected_by_deal(deals: list[dict], horizon: int, basis: str) -> np.ndarray:
    """E[revenue in window] per deal = value * p_win * P(lands within horizon). Exact, no noise.

    Cash uses the median payment delay as a fixed shift so the value stays closed-form.
    """
    out = np.zeros(len(deals))
    for i, d in enumerate(deals):
        window = horizon - (math.exp(d["payment_delay_mu"]) if basis == "cash" else 0)
        if window > 0:
            out[i] = d["value"] * d["p_win"] * norm.cdf((math.log(window) - d["cycle_mu"]) / d["cycle_sigma"])
    return out


def _month_factor(close_days: np.ndarray, as_of: date, f: np.ndarray) -> np.ndarray:
    when = np.datetime64(as_of, "D") + np.minimum(close_days, 3650).astype("timedelta64[D]")
    return f[when.astype("datetime64[M]").astype(int) % 12]


def seasonal_defer(rng, close_days: np.ndarray, as_of: date, season: dict | None, draw=None) -> np.ndarray:
    """Seasonality on close dates. Reweight (default): redraw a close date with probability 1 - f/f_max,
    up to 4 times, so dates land in proportion to how strong their month is, with the same total."""
    if not season or not SEASON_DEFER:
        return close_days
    f = np.array([season.get(m, 1.0) for m in range(1, 13)])
    if SEASON_MODE == "reweight" and draw is not None:
        out = close_days.copy()
        pending = rng.random(out.shape) > _month_factor(out, as_of, f) / f.max()
        for _ in range(3):
            if not pending.any():
                break
            fresh = draw()
            out = np.where(pending, fresh, out)
            pending &= rng.random(out.shape) > _month_factor(out, as_of, f) / f.max()
        return out
    start = np.datetime64(as_of, "D")
    when = start + np.minimum(close_days, 3650).astype("timedelta64[D]")
    month = when.astype("datetime64[M]")
    keep = f[(month.astype(int) % 12)] / f.max()
    defer = rng.random(close_days.shape) > keep
    next_start = (month + 1).astype("datetime64[D]")
    moved = (next_start - start).astype(float) + rng.integers(0, 10, close_days.shape)
    return np.where(defer, moved, close_days)


def simulate(deals: list[dict], as_of: date, targets: dict, receivables: list[dict] = (), seed: int = 42,
             season: dict | None = None) -> dict:
    """Returns {(horizon, basis): result} with the Forecast API fields (minus as_of).

    receivables (won, unpaid) add to cash only: they are already booked.
    """
    rng = np.random.default_rng(seed)
    n = len(deals)
    value = np.array([d["value"] for d in deals])
    p = np.array([d["p_win"] for d in deals])
    mu = np.array([d["cycle_mu"] for d in deals])
    sig = np.array([d["cycle_sigma"] for d in deals])
    dmu = np.array([d["payment_delay_mu"] for d in deals])
    dsig = np.array([d["payment_delay_sigma"] for d in deals])

    # win chance per trial: own uncertainty band (p_win_low..high is a 10-90% band) plus a shared swing
    logit = np.broadcast_to(_logit(p), (TRIALS, n)).copy()
    if PARAM_UNCERTAINTY and n:
        band = (_logit(np.array([d.get("p_win_high", d["p_win"]) for d in deals])) -
                _logit(np.array([d.get("p_win_low", d["p_win"]) for d in deals]))) / 2.563
        logit += rng.standard_normal((TRIALS, n)) * band
    if SHOCK_SD:
        logit += rng.normal(0, SHOCK_SD, (TRIALS, 1))
    win = rng.random((TRIALS, n)) < 1 / (1 + np.exp(-logit))
    draw = lambda: np.exp(mu + sig * rng.standard_normal((TRIALS, n)))  # noqa: E731
    close_days = seasonal_defer(rng, draw(), as_of, season, draw)
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
            e = expected_by_deal(deals, h, basis)
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
