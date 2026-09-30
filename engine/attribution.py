"""Explain the change between two snapshots with a staged walk in a fixed cause order.

Works on the exact expected value (sim.expected_by_deal), so every step is additive per deal
and the causes plus the residual sum to the total change to the rupee.
"""
import math
from datetime import date


from engine.sim import expected_by_deal

CAUSE_ORDER = ["closed_won", "closed_lost", "new_deal", "value_change", "stage_move",
               "close_date", "decay", "calibration", "window_shift"]
MAX_ROWS = 8  # per cause; the rest fold into one "N other deals" row


def _logit(p: float) -> float:
    p = min(max(p, 1e-6), 1 - 1e-6)
    return math.log(p / (1 - p))


def _state(s: dict, as_of: date) -> dict:
    """Walkable deal state. cycle offset is stored relative to the run's as_of."""
    rem = max((s["expected_close_date"] - as_of).days, 7)
    return dict(s, L=_logit(s["p_win"]), offset=s["cycle_mu"] - math.log(rem))


def _values(states: dict, as_of: date, horizon: int, basis: str) -> dict:
    ids = list(states)
    deals = []
    for i in ids:
        s = states[i]
        rem = max((s["expected_close_date"] - as_of).days, 7)
        deals.append(dict(value=s["value"], p_win=1 / (1 + math.exp(-s["L"])), cycle_mu=math.log(rem) + s["offset"],
                          cycle_sigma=s["cycle_sigma"], payment_delay_mu=math.log(max(s["payment_delay_days"], 1))))
    return dict(zip(ids, expected_by_deal(deals, horizon, basis))) if deals else {}


def expected_total(snapshot: list[dict], as_of: date, horizon: int, basis: str) -> float:
    return float(sum(_values({s["deal_id"]: _state(s, as_of) for s in snapshot}, as_of, horizon, basis).values()))


def _money(n: float) -> str:
    return f"₹{n / 1e6:.2f}M" if n >= 1e6 else f"₹{round(n / 1e3)}k"


def attribute(prev: list[dict], prev_as_of: date, curr: list[dict], curr_as_of: date,
              horizon: int, basis: str, status: dict[str, str], rep_names: dict[str, str]) -> dict:
    """status: deal_id -> current status for deals that left the open pipeline."""
    P = {s["deal_id"]: s for s in prev}
    C = {s["deal_id"]: s for s in curr}
    state = {i: _state(s, prev_as_of) for i, s in P.items()}
    as_of = prev_as_of
    before = _values(state, as_of, horizon, basis)
    prev_total = round(sum(before.values()))
    rows: list[dict] = []

    def shift(i, key):
        return C[i]["factors"].get(key, 0) - P[i]["factors"].get(key, 0)

    def step(cause, change, describe):
        nonlocal before
        change()
        after = _values(state, as_of, horizon, basis)
        deltas = []
        for i in set(before) | set(after):
            d = after.get(i, 0.0) - before.get(i, 0.0)
            if abs(d) >= 0.5:
                deltas.append((i, d))
        before = after
        if cause == "window_shift":
            total = sum(d for _, d in deltas)
            if round(total):
                rows.append(dict(cause_type=cause, deal_id=None, deal_name="All open deals", amount=round(total),
                                 description=f"{(curr_as_of - prev_as_of).days} days passed; close dates are nearer"))
            return
        deltas.sort(key=lambda x: -abs(x[1]))
        for i, d in deltas[:MAX_ROWS]:
            if round(d):
                src = C.get(i) or P[i]
                rows.append(dict(cause_type=cause, deal_id=i, deal_name=src["name"], amount=round(d), description=describe(i)))
        rest = deltas[MAX_ROWS:]
        if rest and round(sum(d for _, d in rest)):
            rows.append(dict(cause_type=cause, deal_id=None, deal_name=f"{len(rest)} other deals",
                             amount=round(sum(d for _, d in rest)), description="Smaller moves of the same kind"))

    common = [i for i in P if i in C]
    gone = [i for i in P if i not in C]

    def drop(kind):
        ids = [i for i in gone if (status.get(i, "lost") == "won") == (kind == "won")]
        for i in ids:
            state.pop(i)

    step("closed_won", lambda: drop("won"), lambda i: "Closed won; now booked, out of the open pipeline")
    step("closed_lost", lambda: drop("lost"), lambda i: "Marked closed lost")

    def add_new():
        ids = [i for i in C if i not in P]
        for i in ids:  # walked at the previous date; the window shift step moves it on
            state[i] = _state(C[i], curr_as_of)

    step("new_deal", add_new, lambda i: f"New deal entered at {C[i]['stage'].lower()} stage")

    def edit(fn, when=lambda i: True):
        """Apply fn to common deals that pass `when`: a step only touches deals whose field changed."""
        def run():
            for i in common:
                if when(i):
                    fn(i, state[i])
        return run

    def value_change(i, s):
        s["value"] = C[i]["value"]
        s["L"] += shift(i, "size") + shift(i, "segment")

    step("value_change", edit(value_change, lambda i: C[i]["value"] != P[i]["value"]),
         lambda i: f"Value changed {_money(P[i]['value'])} to {_money(C[i]['value'])}")
    step("stage_move", edit(lambda i, s: s.__setitem__("L", s["L"] + shift(i, "stage")), lambda i: C[i]["stage"] != P[i]["stage"]),
         lambda i: f"Moved from {P[i]['stage'].lower()} to {C[i]['stage'].lower()}")

    def close_date(i, s):
        s["expected_close_date"] = C[i]["expected_close_date"]
        s["L"] += shift(i, "pushes")

    step("close_date", edit(close_date, lambda i: C[i]["expected_close_date"] != P[i]["expected_close_date"]), lambda i: (
        f"Close date moved {P[i]['expected_close_date']:%d %b} to {C[i]['expected_close_date']:%d %b}"))

    def silent_reason(i):
        r = next((x for x in C[i]["reasons"] if x.startswith("silent")), None)
        if r:
            return f"No activity for {r.split()[1]} days"
        return "New activity raised its chance" if shift(i, "silent") > 0 else "Quieter than before"

    # silence changes for every deal as days pass, so this step looks at all of them
    step("decay", edit(lambda i, s: s.__setitem__("L", s["L"] + shift(i, "silent"))), silent_reason)

    # Cause 8 is "model retrain or calibration": land every deal on its new chance to win, so any
    # drift the factor steps did not explain (refit coefficients, intercept) is named here, not hidden.
    def calibration(i, s):
        s["L"] = _logit(C[i]["p_win"])
        s["payment_delay_days"] = C[i]["payment_delay_days"]

    def calibration_text(i):
        if abs(C[i]["calibration"] - P[i]["calibration"]) >= 0.005:
            rep = rep_names.get(C[i]["salesperson_id"], C[i]["salesperson_id"])
            return f"{rep}'s calibration {P[i]['calibration']:.2f} to {C[i]['calibration']:.2f}"
        return f"Model refit: chance to win {P[i]['p_win']:.0%} to {C[i]['p_win']:.0%}"

    step("calibration", edit(calibration), calibration_text)

    def window():  # time passing: move the date and adopt the timing the model now gives each deal
        nonlocal as_of
        for i in common:
            fresh = _state(C[i], curr_as_of)
            state[i]["offset"], state[i]["cycle_sigma"] = fresh["offset"], fresh["cycle_sigma"]
        as_of = curr_as_of

    step("window_shift", window, lambda i: "")

    curr_total = round(expected_total(curr, curr_as_of, horizon, basis))
    residual = curr_total - prev_total - sum(r["amount"] for r in rows)
    return dict(horizon=horizon, basis=basis, prev_total=prev_total, curr_total=curr_total, causes=rows, residual=residual)


if __name__ == "__main__":  # self-check: pure, no database
    from datetime import timedelta

    d0 = date(2026, 9, 21)
    d1 = d0 + timedelta(days=7)

    def snap(i, value=200_000, p=0.5, close=20, pushes=0.0, silent=0.0, cal=1.0, as_of=d0):
        return dict(deal_id=i, name=i, value=value, stage="Proposal", segment="SMB", salesperson_id="R-1",
                    p_win=p, calibration=cal, cycle_mu=math.log(close) + 0.1, cycle_sigma=0.3,
                    payment_delay_days=40, expected_close_date=as_of + timedelta(days=close),
                    factors={"pushes": pushes, "silent": silent}, reasons=[])

    prev = [snap(f"D{k}", close=10 + k * 3) for k in range(12)]
    # push exactly one deal's close date, nothing else changes, same as_of
    moved = [dict(s) for s in prev]
    moved[3] = snap("D3", close=80)
    r = attribute(prev, d0, moved, d0, 30, "bookings", {}, {})
    named = {c["deal_id"] for c in r["causes"]}
    assert named == {"D3"}, named
    assert r["causes"][0]["cause_type"] == "close_date"

    # mark one deal lost: attribution equals that deal's contribution
    lost = [s for s in prev if s["deal_id"] != "D2"]
    r = attribute(prev, d0, lost, d0, 30, "bookings", {"D2": "lost"}, {})
    only = expected_total([prev[2]], d0, 30, "bookings")
    assert r["causes"][0]["cause_type"] == "closed_lost" and abs(r["causes"][0]["amount"] + only) <= 1

    # a messy week: everything sums to the total change exactly
    curr = [snap(f"D{k}", value=200_000 + k * 5_000, p=0.45 + k * 0.01, close=10 + k * 3, silent=-0.1 * (k % 3),
                 cal=0.9, as_of=d1) for k in range(1, 14)]
    r = attribute(prev, d0, curr, d1, 30, "bookings", {"D0": "won"}, {"R-1": "Priya Nair"})
    total = r["curr_total"] - r["prev_total"]
    assert sum(c["amount"] for c in r["causes"]) + r["residual"] == total
    assert abs(r["residual"]) <= 0.05 * abs(total) + 1, (r["residual"], total)
    print("attribution self-check ok:", len(r["causes"]), "rows, residual", r["residual"], "of", total)
