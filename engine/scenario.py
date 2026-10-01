"""Demo: seed a week ago, run, let a realistic week happen to the pipeline, run again, backtest.

Run: python -m engine.scenario <workspace_id>      (wipes and reseeds that workspace)
The week: Acme slips 45 days, Globex is lost, Raj loses two deals (calibration drops), Stark Supply
closes won, Initech arrives, Pied Piper is discounted, Oscorp advances, and four deals go quiet.
"""
from datetime import date, timedelta

from engine import backtest, generate, run
from engine.db import connect

QUIET = ("Hooli", "Soylent", "Tyrell", "Vandelay")


def the_week(conn, ws: str, d1: date):
    with conn.cursor() as cur:
        # the database logs each change below to deal_events (migration 0005), dated this week
        cur.execute("select set_config('app.event_date', %s, true), set_config('app.event_source', 'sample', true)", (str(d1),))
        cur.execute("update deals set expected_close_date = expected_close_date + 45, push_count = push_count + 1 "
                    "where workspace_id = %s and name = 'Acme' and status = 'open'", (ws,))
        cur.execute("update deals set status = 'lost', closed_at = %s where name in ('Globex', 'Brightwater', 'Kestrel Foods') "
                    "and status = 'open' and workspace_id = %s", (d1 - timedelta(days=2), ws))
        cur.execute("update deals set status = 'won', stage = 'Negotiation', closed_at = %s "
                    "where workspace_id = %s and name = 'Stark Supply'", (d1 - timedelta(days=1), ws))
        cur.execute("update deals set value = 220000 where workspace_id = %s and name = 'Pied Piper'", (ws,))
        cur.execute("update deals set stage = 'Negotiation' where workspace_id = %s and name = 'Oscorp'", (ws,))
        # most live deals see activity during the week; the quiet four do not
        cur.execute("update deals set last_activity_date = %s - (abs(hashtext(id)) %% 7) "
                    "where workspace_id = %s and status = 'open' and not (name = any(%s)) and abs(hashtext(id)) %% 10 < 7",
                    (d1, ws, list(QUIET)))
        cur.execute("insert into customers (workspace_id, id, name, segment, payment_terms_days) "
                    "values (%s, 'C-9001', 'Initech', 'SMB', 30) on conflict do nothing", (ws,))
        cur.execute("insert into deals (workspace_id, id, name, customer_id, salesperson_id, value, stage, status, created_at, "
                    "expected_close_date, last_activity_date) values (%s, 'D-9001', 'Initech', 'C-9001', 'R-1', 200000, "
                    "'Proposal', 'open', %s, %s, %s)", (ws, d1 - timedelta(days=3), d1 + timedelta(days=18), d1 - timedelta(days=1)))
    conn.commit()


def main(ws: str):
    d1 = date.today()
    d0 = d1 - timedelta(days=7)
    generate.main(ws, d0)
    run.main(d0, ws)
    with connect() as conn:
        the_week(conn, ws, d1)
    run.main(d1, ws)
    backtest.main(d1, ws)


if __name__ == "__main__":
    import sys
    main(sys.argv[1])
