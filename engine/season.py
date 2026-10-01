"""Seasonality as a clock: some months close more business than others.

Each month has an index (average 1). A deal's remaining work is measured in "business days", and a
calendar day in a 1.3 month clears 1.3 of them, so more deals land in strong months (quarter ends,
the March fiscal year end) and fewer in slow ones. With every index at 1 the clock is the calendar.
"""
from datetime import date, timedelta

import numpy as np

BASE = date(2015, 1, 1)
SPAN = 365 * 30
FLAT = [1.0] * 12
MONTHS = np.array([(BASE + timedelta(days=int(d))).month for d in range(SPAN)]) - 1
DAYS = np.arange(SPAN + 1, dtype=float)
YEAR = np.bincount(MONTHS[:365], minlength=12)  # days per month in a (non-leap) year
LEAD_IN = 120  # days trimmed after the first deal was created: closes ramp up while the first deals mature
TAIL = 90  # days trimmed before as_of: the most recent stretch can be thin while late paperwork lands
MIN_WINDOW = 500  # ~16 months, so most months are seen more than once; backtests show a year alone is too noisy to help
PRIOR = 60  # shrinkage: each month starts with 60 closes at the average rate


class Season:
    def __init__(self, index: list[float] | None = None):
        self.index = [round(float(x), 4) for x in (index or FLAT)]
        self.cum = np.concatenate([[0.0], np.cumsum(np.array(self.index)[MONTHS])])

    @property
    def flat(self) -> bool:
        return all(x == 1.0 for x in self.index)

    def _x(self, d: date) -> int:
        return (d - BASE).days

    def between(self, a: date, b: date) -> float:
        """Business days from a to b (negative if b is before a)."""
        return float(self.cum[self._x(b)] - self.cum[self._x(a)])

    def ahead(self, as_of: date, days):
        """Business days in the next `days` calendar days after as_of (days may be fractional or an array)."""
        x0 = self._x(as_of)
        return np.interp(x0 + np.asarray(days, dtype=float), DAYS, self.cum) - self.cum[x0]

    def calendar(self, as_of: date, business):
        """Calendar days after as_of needed to clear `business` business days (scalar or array)."""
        x0 = self._x(as_of)
        return np.interp(self.cum[x0] + np.asarray(business, dtype=float), self.cum, DAYS) - x0


def fit(closed: list[date], first: date, as_of: date) -> Season:
    """Close rate per calendar month relative to the average, from closes in [first + LEAD_IN, as_of - TAIL).

    Returns the flat calendar when that window is shorter than MIN_WINDOW days. Months the window misses
    stay at 1; thinly covered months are shrunk toward 1.
    """
    start, end = first + timedelta(days=LEAD_IN), as_of - timedelta(days=TAIL)
    if (end - start).days < MIN_WINDOW:
        return Season()
    days_in = np.bincount(MONTHS[(start - BASE).days:(end - BASE).days], minlength=12).astype(float)
    counts = np.bincount([d.month - 1 for d in closed if start <= d < end], minlength=12).astype(float)
    if counts.sum() < 120:
        return Season()
    avg = counts.sum() / days_in.sum()
    ratio = np.where(days_in > 0, counts / np.maximum(days_in, 1) / avg, 1.0)
    idx = (counts * ratio + PRIOR) / (counts + PRIOR)  # shrink thin months toward 1
    idx = idx / (idx @ YEAR / 365)  # a year still holds 365 business days
    return Season(list(idx))
