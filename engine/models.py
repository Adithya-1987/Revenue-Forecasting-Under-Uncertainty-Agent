"""Turn deal rows into DealInputs: win probability with named factors, close timing on the seasonal clock,
cash delay against each customer's payment terms, rep calibration.

History rows' features are read 21 days before close (the generator's convention); open rows at as_of.
Run `python -m engine.models` to check the models recover the truth planted by engine/generate.py.
"""
import math
from datetime import date, timedelta

import numpy as np
from sklearn.linear_model import LogisticRegression

from engine import season as seasonality

STAGES = ["Qualify", "Demo", "Proposal", "Negotiation"]
SEGMENTS = ["SMB", "Mid-Market", "Enterprise"]
# column -> factor name shown to users; stage_* columns fold into one "stage" factor
COLUMNS = ["stage_Demo", "stage_Proposal", "stage_Negotiation", "silent", "pushes", "size", "seg_Mid", "seg_Ent", "age", "stalled"]
FACTOR_OF = {"stage_Demo": "stage", "stage_Proposal": "stage", "stage_Negotiation": "stage", "silent": "silent",
             "pushes": "pushes", "size": "size", "seg_Mid": "segment", "seg_Ent": "segment", "age": "age", "stalled": "stalled"}
CAL_PSEUDO = 10  # shrinkage: a rep starts with 10 perfectly calibrated deals
OBS_LAG = timedelta(days=21)
STALL_FREE = 21  # days in one stage before the deal counts as stalled
STALL_CAP = 60
PAY_SETTLE = timedelta(days=150)  # payment history only from deals won at least this long ago

DEAL_COLS = ["id", "name", "segment", "salesperson_id", "customer_id", "value", "stage", "status", "created_at",
             "expected_close_date", "last_activity_date", "push_count", "closed_at", "paid_at", "stage_entered_at", "terms"]
_SQL_COL = {"segment": "c.segment", "terms": "c.payment_terms_days"}


def load_deals(conn, ws: str) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(f"select {', '.join(_SQL_COL.get(c, 'd.' + c) for c in DEAL_COLS)} "
                    "from deals d join customers c on c.workspace_id = d.workspace_id and c.id = d.customer_id "
                    "where d.workspace_id = %s", (ws,))
        return [dict(zip(DEAL_COLS, r)) | {"value": float(r[5])} for r in cur.fetchall()]


def silent_days(d: dict, obs: date) -> int:
    return max((obs - d["last_activity_date"]).days, 0)


def age_days(d: dict, obs: date) -> int:
    return max((obs - d["created_at"]).days, 1)


def stage_days(d: dict, obs: date) -> int:
    return max((obs - d["stage_entered_at"]).days, 0)


def feature_row(d: dict, obs: date, ref: dict) -> list[float]:
    seg = d["segment"]
    return [
        d["stage"] == "Demo", d["stage"] == "Proposal", d["stage"] == "Negotiation",
        min(max(silent_days(d, obs) - 7, 0), 60), d["push_count"], math.log(d["value"] / ref["medians"][seg]),
        seg == "Mid-Market", seg == "Enterprise",
        max(math.log(age_days(d, obs) / ref["cycles"][seg]), 0),  # older than the segment's usual cycle
        min(max(stage_days(d, obs) - STALL_FREE, 0), STALL_CAP),  # stuck in the current stage
    ]


def _planned(d: dict) -> int:
    return max((d["expected_close_date"] - d["created_at"]).days, 7)


def _size(d: dict, medians: dict) -> float:
    return math.log(d["value"] / medians[d["segment"]])


def fit(history: list[dict], as_of: date, bootstrap: int = 30, seed: int = 0) -> dict:
    """Fit every model on deals closed by as_of. Pure: same rows in, same model out."""
    medians = {s: float(np.median([d["value"] for d in history if d["segment"] == s] or [1])) for s in SEGMENTS}
    cycles = {s: float(np.median([_planned(d) for d in history if d["segment"] == s] or [30])) for s in SEGMENTS}
    ref = dict(medians=medians, cycles=cycles)
    X = np.array([feature_row(d, d["closed_at"] - OBS_LAG, ref) for d in history], dtype=float)
    y = np.array([d["status"] == "won" for d in history])
    lr = LogisticRegression(C=10, max_iter=2000).fit(X, y)

    rng = np.random.default_rng(seed)
    boots = []
    for _ in range(bootstrap):
        i = rng.integers(0, len(y), len(y))
        b = LogisticRegression(C=10, max_iter=2000).fit(X[i], y[i])
        boots.append(np.append(b.coef_[0], b.intercept_[0]))

    p_hist = lr.predict_proba(X)[:, 1]
    cal = {}
    for rep in {d["salesperson_id"] for d in history}:
        m = np.array([d["salesperson_id"] == rep for d in history])
        cal[rep] = float((y[m].sum() + CAL_PSEUDO) / (p_hist[m].sum() + CAL_PSEUDO))

    # Seasonality first (from when deals closed), then timing measured on that clock:
    # log(business days taken / days planned) = segment slip + size slip * log(value / segment median) + noise
    season = seasonality.fit([d["closed_at"] for d in history], min(d["created_at"] for d in history), as_of)
    T = np.array([[d["segment"] == s for s in SEGMENTS] + [_size(d, medians)] for d in history], dtype=float)
    t = np.log(np.array([max(season.between(d["created_at"], d["closed_at"]), 1) / _planned(d) for d in history]))
    coef = np.linalg.lstsq(T, t, rcond=None)[0]
    resid = t - T @ coef
    seg_of = np.array([d["segment"] for d in history])
    timing = dict(slip={s: float(coef[k]) for k, s in enumerate(SEGMENTS)}, size_slip=float(coef[-1]),
                  sigma={s: float(max(resid[seg_of == s].std(), 0.05)) if (seg_of == s).sum() > 1 else 0.4 for s in SEGMENTS})

    # Cash: lateness against each customer's own terms, log(days to pay / terms), per segment. Only deals won
    # long enough ago that slow payers have paid too; recent wins would leave just the fast ones in the sample.
    settled = as_of - PAY_SETTLE
    payment = {}
    for s in SEGMENTS:
        late = [math.log(max((d["paid_at"] - d["closed_at"]).days, 1) / max(d["terms"], 1)) for d in history
                if d["segment"] == s and d["status"] == "won" and d["paid_at"] and d["closed_at"] <= settled]
        payment[s] = (float(np.mean(late)), float(max(np.std(late), 0.05))) if len(late) > 5 else (0.1, 0.3)

    return dict(lr=lr, boots=np.array(boots), means=X.mean(axis=0), ref=ref, medians=medians, cal=cal,
                season=season, timing=timing, payment=payment, p_hist=p_hist, y=y)


def timing_for(model: dict, d: dict) -> tuple[float, float]:
    """(mu, sigma) of log(business days the deal will take / days planned)."""
    t = model["timing"]
    return t["slip"][d["segment"]] + t["size_slip"] * _size(d, model["medians"]), t["sigma"][d["segment"]]


def payment_for(model: dict, d: dict) -> tuple[float, float]:
    """(mu, sigma) of log(days from close to cash): the customer's terms, stretched by its segment's lateness."""
    mu, sig = model["payment"][d["segment"]]
    terms = d.get("terms")
    return math.log(max(30 if terms is None else terms, 1)) + mu, sig


_Z = np.random.default_rng(1).standard_normal(4000)  # fixed draws: same inputs, same answer


def remaining(mu: float, sigma: float, scale: float, elapsed: float) -> tuple[float, float]:
    """Lognormal fit of (total - elapsed) given total = scale * lognormal(mu, sigma) and total > elapsed.

    An overdue deal is not "7 days from closing": it still has the tail of its slip to live through.
    """
    total = scale * np.exp(mu + sigma * _Z)
    left = total[total > elapsed + 1] - elapsed
    if len(left) < 100:  # far past anything seen: slow, uncertain
        return math.log(max(0.3 * scale, 7)), 0.6
    logs = np.log(left)
    return float(logs.mean()), float(max(logs.std(), 0.1))


def ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def reasons_for(d: dict, as_of: date, cal: float, p: float, ref: dict) -> list[str]:
    out, silent, in_stage, age = [], silent_days(d, as_of), stage_days(d, as_of), age_days(d, as_of)
    if silent >= 14:
        out.append(f"silent {silent} days")
    if d["push_count"]:
        out.append(f"{ordinal(d['push_count'])} date push")
    # only when the stage date is known: a back-filled clock (entered = created) would overstate it
    if in_stage >= 45 and (d["stage"] == "Qualify" or d["stage_entered_at"] > d["created_at"]):
        out.append(f"{in_stage} days in {d['stage'].lower()}")
    if cal < 0.9:
        out.append("optimistic rep")
    elif cal > 1.1:
        out.append("cautious rep")
    if age > 2 * ref["cycles"][d["segment"]]:
        out.append(f"open {age} days")
    if d["stage"] in ("Qualify", "Demo"):
        out.append("early stage")
    if d["value"] > 2.5 * ref["medians"][d["segment"]]:
        out.append(f"large for {d['segment']}")
    if not out and p > 0.6:
        out.append("late stage" if d["stage"] == "Negotiation" else "on track")
    return out[:3]


def deal_inputs(model: dict, open_deals: list[dict], as_of: date) -> list[dict]:
    """The contract: one DealInput per open deal. p_win already includes rep calibration; cycle_mu/sigma are
    the remaining business days (seasonal clock) from as_of."""
    if not open_deals:
        return []
    lr, ref, season = model["lr"], model["ref"], model["season"]
    X = np.array([feature_row(d, as_of, ref) for d in open_deals], dtype=float)
    raw = lr.predict_proba(X)[:, 1]
    contrib = (X - model["means"]) * lr.coef_[0]  # logit contribution of each column vs an average deal
    b = model["boots"]
    boot_p = 1 / (1 + np.exp(-(X @ b[:, :-1].T + b[:, -1]))) if len(b) else raw[:, None]  # deals x bootstraps
    out = []
    for i, d in enumerate(open_deals):
        cal = model["cal"].get(d["salesperson_id"], 1.0)
        clip = lambda v: float(min(max(v * cal, 0.01), 0.98))  # noqa: E731
        factors: dict[str, float] = {}
        for j, col in enumerate(COLUMNS):
            factors[FACTOR_OF[col]] = factors.get(FACTOR_OF[col], 0.0) + float(contrib[i, j])
        mu_s, sig_s = timing_for(model, d)
        cmu, csig = remaining(mu_s, sig_s, _planned(d), max(season.between(d["created_at"], as_of), 0))
        dmu, dsig = payment_for(model, d)
        p = clip(raw[i])
        out.append(dict(
            deal_id=d["id"], name=d["name"], value=d["value"], stage=d["stage"], segment=d["segment"],
            salesperson_id=d["salesperson_id"], customer_id=d["customer_id"],
            p_win=p, p_win_low=clip(np.percentile(boot_p[i], 10)), p_win_high=clip(np.percentile(boot_p[i], 90)),
            calibration=cal, cycle_mu=cmu, cycle_sigma=csig,
            payment_delay_mu=dmu, payment_delay_sigma=dsig, expected_close_date=d["expected_close_date"],
            factors={k: round(v, 4) for k, v in factors.items()},
            reasons=reasons_for(d, as_of, cal, p, ref),
        ))
    return out


def receivables(model: dict, deals: list[dict], as_of: date) -> list[dict]:
    """Won but unpaid: signed is not cash. Days left until paid, given it is already this late."""
    out = []
    for d in deals:
        if d["status"] == "won" and d["closed_at"] <= as_of and (d["paid_at"] is None or d["paid_at"] > as_of):
            dmu, dsig = payment_for(model, d)
            mu, sig = remaining(dmu, dsig, 1.0, (as_of - d["closed_at"]).days)
            out.append(dict(name=d["name"], value=d["value"], mu=mu, sigma=sig))
    return out


MIN_HISTORY = 200


def get_deal_inputs(conn, ws: str, as_of: date) -> tuple[list[dict], list[dict], dict]:
    """(open DealInputs, receivables, fitted model), using only deals closed by as_of."""
    deals = load_deals(conn, ws)
    history = [d for d in deals if d["status"] != "open" and d["closed_at"] <= as_of]
    if len(history) < MIN_HISTORY or len({d["status"] for d in history}) < 2:
        raise SystemExit(f"Need at least {MIN_HISTORY} closed deals, both won and lost, to learn from. "
                         f"This workspace has {len(history)}. Add history rows to the CSV, or use sample data.")
    model = fit(history, as_of)
    return deal_inputs(model, [d for d in deals if d["status"] == "open"], as_of), receivables(model, history, as_of), model


if __name__ == "__main__":  # recovery check: fit on the generator's data, compare with what it planted. No database.
    from engine import generate as g

    as_of = date(2026, 9, 24)
    deals = [d | {"salesperson_id": d["rep"], "customer_id": "C-" + d["id"][2:]} for d in g.make_data(as_of)]
    model = fit([d for d in deals if d["status"] != "open"], as_of, bootstrap=0)
    coef = dict(zip(COLUMNS, model["lr"].coef_[0]))
    months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    true_s, got_s = np.array(g.TRUE_SEASON.index), np.array(model["season"].index)
    rows = [
        ("Seasonality, correlation with planted", 1.0, float(np.corrcoef(true_s, got_s)[0, 1])),
        ("Strongest month", months[int(true_s.argmax())], months[int(got_s.argmax())]),
        ("Weakest month", months[int(true_s.argmin())], months[int(got_s.argmin())]),
        ("Cycle overrun per log size", g.SIZE_SLIP, model["timing"]["size_slip"]),
        *[(f"Cycle slip, {s}", g.SEGMENTS[s]["slip"], model["timing"]["slip"][s]) for s in SEGMENTS],
        ("Win logit per log(age / cycle)", g.AGE_LOGIT, coef["age"]),
        ("Win logit per stalled day", g.STALL_PER_DAY, coef["stalled"]),
        ("Win logit per silent day", g.SILENT_PER_DAY, coef["silent"]),
        *[(f"Late payment, {s}", g.SEGMENTS[s]["late"], model["payment"][s][0]) for s in SEGMENTS],
    ]
    print(f"{'':42}{'planted':>10}{'recovered':>12}")
    for name, want, got in rows:
        fmt = (lambda v: f"{v:>10.3f}") if isinstance(want, float) else (lambda v: f"{v:>10}")
        print(f"{name:42}{fmt(want)}{fmt(got):>12}")
    print("season index:", ", ".join(f"{m} {x:.2f}" for m, x in zip(months, got_s)))

    assert np.corrcoef(true_s, got_s)[0, 1] > 0.8, "seasonality not recovered"
    assert months[int(got_s.argmax())] == "Mar", "fiscal year end not the strongest month"
    assert abs(model["timing"]["size_slip"] - g.SIZE_SLIP) < 0.06, "size slip not recovered"
    for s in SEGMENTS:
        assert abs(model["timing"]["slip"][s] - g.SEGMENTS[s]["slip"]) < 0.08, f"{s} slip not recovered"
        assert abs(model["payment"][s][0] - g.SEGMENTS[s]["late"]) < 0.05, f"{s} lateness not recovered"
    for col, want in (("age", g.AGE_LOGIT), ("stalled", g.STALL_PER_DAY), ("silent", g.SILENT_PER_DAY)):
        assert 0.5 * abs(want) < -coef[col] < 1.6 * abs(want), f"{col} effect not recovered: {coef[col]:.3f} vs {want}"
    print("model recovery check ok")
