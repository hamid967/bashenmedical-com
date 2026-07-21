#!/usr/bin/env python3
"""Design-system lint — forbid arbitrary colors in /portal/* routes.

Fails if any src/routes/_authenticated/portal.*.tsx or
src/components/portal/ui/*.tsx file uses:
- Raw hex outside url() or var() (allowed inside styles.css only)
- `text-white` / `bg-black` / `text-gray-*` / `bg-gray-*` tailwind classes
- `text-slate-*` / `bg-slate-*`
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GLOBS = [
    "src/routes/_authenticated/portal.*.tsx",
    "src/routes/_authenticated/portal.tsx",
    "src/components/portal/ui/*.tsx",
]

FORBIDDEN = [
    (re.compile(r"\btext-white\b"), "text-white → use text-[color:var(--portal-*)] or keep on gradients only"),
    (re.compile(r"\bbg-black\b"), "bg-black"),
    (re.compile(r"\b(text|bg|border)-gray-\d{2,3}\b"), "gray-* tailwind"),
    (re.compile(r"\b(text|bg|border)-slate-\d{2,3}\b"), "slate-* tailwind"),
    (re.compile(r"#[0-9a-fA-F]{6}\b(?![^(]*\))"), "raw hex literal (use var(--portal-*))"),
]

# Whitelist: text-white on gradient backgrounds is fine; auto-fix later.
ALLOWLIST_LINE = re.compile(r"portal-gradient")

def scan():
    problems = []
    for pattern in GLOBS:
        for p in ROOT.glob(pattern):
            for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
                if ALLOWLIST_LINE.search(line):
                    continue
                for rx, msg in FORBIDDEN:
                    if rx.search(line):
                        problems.append(f"{p.relative_to(ROOT)}:{i}: {msg}\n  {line.strip()[:140]}")
    return problems

if __name__ == "__main__":
    problems = scan()
    if problems:
        print(f"❌ {len(problems)} token violations in /portal/*:\n")
        for p in problems[:80]:
            print(p)
        if len(problems) > 80:
            print(f"... and {len(problems) - 80} more")
        sys.exit(1)
    print("✅ portal token lint passed — no arbitrary colors")
