# Landing page: the scroll story

The landing page tells one story: **a CRM's single number becomes a range you can plan on, and every change is explained.**
There are no cards. Every figure on the page is drawn as data and moves with the scroll. The same twelve deals
carry the story from the first formula to the final range.

All numbers come from the bundled sample company (`web/src/mocks`). The twelve deals are the largest open deals in
`risk.json`; the range, the change ledger and the backtest are `forecast.json`, `changes.json` and `accuracy.json`.

## 0. Hero: the fan

- The headline rises word by word on load: *Forecast revenue as a range. Explain every change.*
- Behind it, a fan of 36 possible revenue paths draws itself in and keeps breathing. It leans toward the pointer.
- **Scroll:** the headline lifts away and the fan collapses into one line, which is the single number the CRM
  gives you. The next scene starts there.

## 1. The engine (pinned, seven chapters)

The stage on the right holds the twelve deals. The header shows the running total. The captions on the left change
with each chapter, and a rail marks progress. Hovering a deal shows its details.

| # | Chapter | What the deals do | Header |
|---|---------|-------------------|--------|
| 1 | One number, from a formula | Bubbles sized by value pop out of the total, each showing its stage % | Σ value × stage % counts up |
| 2 | Every deal, re-scored | Bubbles morph into bars at stage %, then slide to the learned chance | the total re-counts |
| 3 | Silence is a signal | Quiet deals get a "silent 42d" tag and their bars shrink | the total drops |
| 4 | Every rep, calibrated | Rows regroup by salesperson; optimists shrink, sandbaggers grow | the total lands on Σ value × p_win |
| 5 | Signed is not paid | Bars shrink to dots on a calendar; each dot runs out to its payment date; Acme and Wonka leave the 90-day window | cash inside 90 days |
| 6 | 10,000 futures | The dots fly into one origin and 40 simulated paths fan out; the outcome histogram builds at their ends | futures counter to 10,000 |
| 7 | A range you can plan on | The paths dim, the P10 to P90 capsule closes over the histogram, the target line drops in | ₹1.52M – ₹2.38M and the chance of target |

## 2. Capabilities

Two rows of large type run in opposite directions. They speed up and skew with scroll velocity.

## 3. Range lab (interactive)

The histogram rises as the section enters. You pick a horizon (30, 60 or 90 days) and a basis (bookings or cash),
and you drag the target. Bars recolour at the target, the capsule and P-labels slide, and the chance of target
re-counts. Each value comes from the histogram for that forecast.

## 4. Why it moved (pinned)

A waterfall builds step by step: last week ₹2.4M, closed lost, new deals, close dates moved, inactivity,
calibration, then this week ₹1.92M. The total on the left counts with each step. The ledger beside it names the
deals behind the current step.

## 5. Proof (pinned)

The backtest draws month by month. The P10 to P90 band unrolls, the predicted line follows, and each actual lands
as a dot, either inside or outside the band. The counter reaches *10 of 12 months inside the range*. The error bars
then race: Rangefinder 11% against the stage formula 31%.

## 6. Close

The headline lights up word by word as you scroll, and the fan from the hero opens again behind it. Two
calls to action rise in.

## Motion rules

- One smooth scroller (GSAP ScrollSmoother). Pins are created top to bottom.
- Only transforms, opacity and SVG attributes are animated. Moving surfaces have no backdrop blur.
- **Reduced motion:** there is no smoothing or tweening. Each pinned scene jumps to the end state of the chapter
  you have scrolled to, so every number and chart is still shown.
- **Narrow screens:** the engine uses a narrower stage, and the captions sit above it.
