"""
Shared E2E helpers: smart retries with backoff + auto-artifacts on failure.

Import from tests:

    from _helpers import make_recording_context, retry_async, finalize_context

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context, art = await make_recording_context(
            browser, name="book-hold", locale="ar-SA",
        )
        page = await context.new_page()
        try:
            await retry_async(lambda: page.goto(f"{BASE}/book", wait_until="domcontentloaded"))
            ...
            await finalize_context(context, art, page, ok=True)
        except Exception:
            await finalize_context(context, art, page, ok=False)
            raise

Design goals:
  * Idempotent, safe to import from every test.
  * Retries only on transient categories (Timeout / network / assertion mismatch).
  * On failure: dumps screenshot, stops trace zip, closes HAR — everything
    lands under ${E2E_ARTIFACTS}/<name>/ so CI can upload one directory.
"""
from __future__ import annotations

import asyncio
import inspect
import os
import random
import time
from pathlib import Path
from typing import Awaitable, Callable, Optional, TypeVar

from playwright.async_api import (
    BrowserContext,
    Error as PlaywrightError,
    Page,
    TimeoutError as PlaywrightTimeoutError,
)

T = TypeVar("T")

ART_ROOT = Path(os.environ.get("E2E_ARTIFACTS", "e2e-artifacts")).resolve()

# Exceptions we consider transient and worth retrying.
_RETRYABLE = (PlaywrightTimeoutError, PlaywrightError, AssertionError, ConnectionError, OSError)


async def retry_async(
    fn: Callable[[], Awaitable[T] | T],
    *,
    attempts: int = 3,
    base_delay: float = 0.4,
    max_delay: float = 4.0,
    label: Optional[str] = None,
    on_retry: Optional[Callable[[int, BaseException], Awaitable[None] | None]] = None,
) -> T:
    """Retry an async (or sync) call with exponential backoff + jitter.

    Only re-raises after `attempts` failures. Non-retryable errors bubble up
    immediately so bugs in test logic don't get masked by silent retries.
    """
    tag = label or getattr(fn, "__name__", "step")
    last_err: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            result = fn()
            if inspect.isawaitable(result):
                result = await result
            if attempt > 1:
                print(f"[retry_async] {tag}: succeeded on attempt {attempt}/{attempts}")
            return result  # type: ignore[return-value]
        except _RETRYABLE as exc:
            last_err = exc
            if attempt == attempts:
                break
            delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
            delay += random.uniform(0, base_delay)  # jitter
            print(f"[retry_async] {tag}: attempt {attempt}/{attempts} failed ({type(exc).__name__}: {exc!s:.180}); sleeping {delay:.2f}s")
            if on_retry is not None:
                cb = on_retry(attempt, exc)
                if inspect.isawaitable(cb):
                    await cb
            await asyncio.sleep(delay)
    # Exhausted
    assert last_err is not None
    raise last_err


async def retry_goto(page: Page, url: str, *, attempts: int = 3, **kwargs) -> None:
    """Robust page.goto with retries; reloads on transient net errors."""
    kwargs.setdefault("wait_until", "domcontentloaded")
    kwargs.setdefault("timeout", 20_000)
    await retry_async(
        lambda: page.goto(url, **kwargs),
        attempts=attempts,
        label=f"goto {url}",
    )


async def retry_click(locator, *, attempts: int = 3, timeout: int = 6_000) -> None:
    """Robust click with retries — good for elements that mount after fetch."""
    await retry_async(
        lambda: locator.click(timeout=timeout),
        attempts=attempts,
        label="click",
    )


async def wait_for_response(
    page: Page,
    url_predicate,
    *,
    attempts: int = 2,
    timeout: int = 10_000,
):
    """Wait for a matching network response with retries around timeout."""
    return await retry_async(
        lambda: page.wait_for_response(url_predicate, timeout=timeout),
        attempts=attempts,
        label="wait_for_response",
    )


def _slugify(name: str) -> str:
    return "".join(c if c.isalnum() or c in ("-", "_") else "-" for c in name).strip("-").lower() or "e2e"


async def make_recording_context(
    browser,
    *,
    name: str,
    locale: str = "ar-SA",
    viewport: dict | None = None,
    extra_context_options: dict | None = None,
):
    """Create a BrowserContext that records HAR + video + tracing.

    Returns (context, artifacts_dict) where artifacts_dict has:
        root, screenshots, videos, har_path, trace_path
    All paths are absolute and their parent dirs already exist.
    """
    slug = _slugify(name)
    root = ART_ROOT / slug
    shots = root / "screenshots"
    videos = root / "videos"
    traces = root / "traces"
    for d in (shots, videos, traces):
        d.mkdir(parents=True, exist_ok=True)

    stamp = time.strftime("%Y%m%d-%H%M%S")
    har_path = root / f"network-{stamp}.har"
    trace_path = traces / f"trace-{stamp}.zip"

    ctx_opts: dict = {
        "viewport": viewport or {"width": 1280, "height": 1800},
        "locale": locale,
        "record_video_dir": str(videos),
        "record_video_size": {"width": 1280, "height": 900},
        "record_har_path": str(har_path),
        "record_har_content": "omit",  # keep HAR small; headers + timings are enough
    }
    if extra_context_options:
        ctx_opts.update(extra_context_options)

    context = await browser.new_context(**ctx_opts)
    try:
        await context.tracing.start(screenshots=True, snapshots=True, sources=True)
    except PlaywrightError as exc:
        # Tracing is best-effort; don't fail the whole suite if unavailable.
        print(f"[helpers] tracing.start failed: {exc}")

    return context, {
        "root": root,
        "screenshots": shots,
        "videos": videos,
        "har_path": har_path,
        "trace_path": trace_path,
    }


async def finalize_context(
    context: BrowserContext,
    artifacts: dict,
    page: Optional[Page],
    *,
    ok: bool,
) -> None:
    """Stop tracing and close HAR/video. On failure, dump a screenshot too.

    Safe to call from `finally:` — swallows secondary errors so the original
    failure propagates cleanly.
    """
    # Failure screenshot (best-effort, don't shadow the underlying error)
    if not ok and page is not None:
        try:
            fail_path = artifacts["screenshots"] / f"FAILURE-{time.strftime('%H%M%S')}.png"
            await page.screenshot(path=str(fail_path))
            print(f"[helpers] failure screenshot: {fail_path}")
        except Exception as exc:
            print(f"[helpers] failure screenshot failed: {exc}")

    # Trace stop — write zip so CI can inspect timeline
    try:
        await context.tracing.stop(path=str(artifacts["trace_path"]))
        print(f"[helpers] trace: {artifacts['trace_path']}")
    except Exception as exc:
        print(f"[helpers] tracing.stop failed: {exc}")

    # Closing the context finalizes the HAR + video files.
    try:
        await context.close()
        print(f"[helpers] HAR: {artifacts['har_path']}")
    except Exception as exc:
        print(f"[helpers] context.close failed: {exc}")
