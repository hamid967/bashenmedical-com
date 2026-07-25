# Design QA — Contrast + Visual Regression

Two scripts, one bar: catch design-token regressions before they hit users.

## 1. Automated contrast audit

Parses hex tokens from `src/styles.css` `:root` and computes WCAG 2.2 contrast
ratios for every critical foreground/background pair (body text, muted, primary
button, focus ring, etc.). Runs in ~20 ms — safe for CI on every push.

```bash
bun run design:contrast              # human-readable report
bun run design:contrast:json         # + /tmp/contrast-audit.json
```

- Normal text is audited at **4.5:1** (AA).
- Large text / focus rings at **3:1** (AA large / UI component boundary).
- Decorative surfaces (subtle card outline) report as `INFO` per WCAG 1.4.11
  exception — visible but not a gate failure.

Exit codes: `0` all pass · `1` failures · `2` missing tokens.

## 2. Visual regression snapshots

Playwright + Pillow. Captures each key public route at 1280×1800 with
reduced motion, `ar-SA` locale, and a pinned clock, then pixel-diffs against
the committed baseline under
`scripts/design/visual-regression/baseline/*.png`.

```bash
# initial (or after an approved redesign): refresh baselines
bun run design:visual:update

# CI / dev check: diff current build against baselines
bun run design:visual                # → /tmp/visual-regression/report.json
```

Output layout:

```
/tmp/visual-regression/
  current/<route>.png       ← this run
  diff/<route>.png          ← red-highlight overlay of changed pixels
scripts/design/visual-regression/baseline/<route>.png
```

Threshold: **> 0.5 %** of pixels changed → `status: "changed"` and the run
exits non-zero. Missing baselines print `no_baseline` but do not fail
(bootstrap-friendly).

### Routes covered

`/`, `/doctors`, `/book`, `/auth/login`, `/faq`, `/insurance/verify`.
Add more by editing the `ROUTES` list in `scripts/design/visual-regression.py`.

## When to run

| Change                             | Contrast | Visual |
| ---------------------------------- | :------: | :----: |
| Editing tokens in `src/styles.css` |    ✔     |   ✔    |
| Redesigning a public route         |          |   ✔    |
| Adjusting ui-v3 primitives         |    ✔     |   ✔    |

The contrast audit is cheap enough to wire into `bun run build` if the team
wants a hard gate — right now it stays a targeted check to keep local
builds fast.
