#!/usr/bin/env python3
"""Ensure every /portal/*.tsx route uses PortalPageHeader (or is intentionally exempt)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROUTES = ROOT / "src/routes/_authenticated"

# Layout/wrapper files and dynamic order detail (custom shell) are exempt.
EXEMPT = {
    "portal.tsx",
    "portal.index.tsx",  # marketing-style landing — reviewed separately
    "portal.orders.$kind.$id.tsx",
}

missing = []
for p in sorted(ROUTES.glob("portal.*.tsx")):
    if p.name in EXEMPT:
        continue
    src = p.read_text(encoding="utf-8")
    if "PortalPageHeader" not in src:
        missing.append(p.name)

if missing:
    print(f"⚠️  {len(missing)} portal routes missing PortalPageHeader adoption:")
    for m in missing:
        print(f"  - {m}")
    # Migration is progressive — this is a warning, not a hard fail.
    # Flip to sys.exit(1) once Batch 3 (page migrations) completes.
    sys.exit(0)
print("✅ all portal routes use PortalPageHeader")
