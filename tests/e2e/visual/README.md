# Portal visual regression

Screenshot-based regression suite for the patient portal.

## Run

```bash
# Compare against committed baselines
python3 tests/e2e/portal_visual_regression.py

# Refresh baselines after an intentional design change
UPDATE_BASELINES=1 python3 tests/e2e/portal_visual_regression.py
```

Requires:
- Dev server running at `http://localhost:8080`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in env (test patient is created + deleted)

## Layout

- `baselines/<page>.png` — committed source of truth. Update intentionally.
- `actual/<page>.png` — most recent capture (gitignored).
- `diffs/<page>.png` — red overlay of changed pixels (gitignored).

## Tuning

- `VISUAL_THRESHOLD` (default `0.01`) — max fraction of pixels allowed to differ.
- `VISUAL_PIXEL_TOLERANCE` (default `12`) — per-channel delta a pixel must exceed to count.

Add `data-visual-ignore` on any element whose content is inherently dynamic
(timestamps, "last updated" chips) so it is hidden during capture.

## Pages covered

- `/portal` (dashboard)
- `/portal/appointments`
- `/portal/reports`
- `/portal/invoices`

Extend the `PAGES` list in `portal_visual_regression.py` to add more.
