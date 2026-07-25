/**
 * Unit tests: signed-URL download error handling for the /my tabs
 * (المختبر / الأشعة / الفواتير).
 *
 * Covers the pure friendly-message mapping used by DownloadFileButton in
 * src/routes/_authenticated/my.tsx to render the "إعادة المحاولة" retry
 * button + destructive error text.
 *
 * Run:  bun tests/unit/download-error.test.ts
 */
import {
  getFriendlyDownloadError,
  DOWNLOAD_ERROR_MESSAGES,
  shouldPerformHeadCheck,
  recordDownloadSuccess,
  recordDownloadFailure,
  INITIAL_HEAD_CHECK_STATE,
  HEAD_CHECK_DEFAULTS,
  SIGNED_URL_TTL_SECONDS,
  formatSignedUrlValidity,
  formatCountdown,
  type DownloadBucket,
} from "../../src/lib/download-error";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}\n    ${(err as Error).message}`);
    failed++;
  }
}
function eq<T>(got: T, want: T, label = "value") {
  if (got !== want) {
    throw new Error(`${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
}

console.log("getFriendlyDownloadError — file-not-found → user-friendly Arabic");
test("maps 'Object not found' → notFound", () => {
  eq(getFriendlyDownloadError("Object not found"), DOWNLOAD_ERROR_MESSAGES.notFound);
});
test("maps literal '404' → notFound", () => {
  eq(getFriendlyDownloadError("404"), DOWNLOAD_ERROR_MESSAGES.notFound);
});
test("maps 'not-found' with hyphen → notFound", () => {
  eq(getFriendlyDownloadError("not-found"), DOWNLOAD_ERROR_MESSAGES.notFound);
});

console.log("getFriendlyDownloadError — expired URL");
test("maps 'signed url expired' → expired", () => {
  eq(getFriendlyDownloadError("signed url expired"), DOWNLOAD_ERROR_MESSAGES.expired);
});
test("maps Arabic 'انتهت الصلاحية' → expired", () => {
  eq(getFriendlyDownloadError("انتهت الصلاحية"), DOWNLOAD_ERROR_MESSAGES.expired);
});

console.log("getFriendlyDownloadError — fallbacks");
test("empty string → generic", () => {
  eq(getFriendlyDownloadError(""), DOWNLOAD_ERROR_MESSAGES.generic);
});
test("null → generic", () => {
  eq(getFriendlyDownloadError(null), DOWNLOAD_ERROR_MESSAGES.generic);
});
test("undefined → generic", () => {
  eq(getFriendlyDownloadError(undefined), DOWNLOAD_ERROR_MESSAGES.generic);
});
test("whitespace-only → generic", () => {
  eq(getFriendlyDownloadError("   \n\t"), DOWNLOAD_ERROR_MESSAGES.generic);
});
test("unknown non-empty message passes through verbatim", () => {
  eq(
    getFriendlyDownloadError("Storage bucket permission denied"),
    "Storage bucket permission denied",
  );
});

console.log("DOWNLOAD_ERROR_MESSAGES — Arabic UI strings present");
test("invalidUrl message is set for HEAD non-ok path", () => {
  if (!DOWNLOAD_ERROR_MESSAGES.invalidUrl.length) {
    throw new Error("invalidUrl must be a non-empty Arabic message");
  }
});
test("unexpected message is set for catch-all path", () => {
  if (!DOWNLOAD_ERROR_MESSAGES.unexpected.length) {
    throw new Error("unexpected must be a non-empty Arabic message");
  }
});
test("downloadStarted success toast is set", () => {
  if (!DOWNLOAD_ERROR_MESSAGES.downloadStarted.length) {
    throw new Error("downloadStarted must be a non-empty Arabic message");
  }
});

console.log("DownloadBucket — covers the three /my tabs");
test("lab-reports bucket is a valid DownloadBucket", () => {
  const b: DownloadBucket = "lab-reports";
  eq(b, "lab-reports");
});
test("radiology-reports bucket is a valid DownloadBucket", () => {
  const b: DownloadBucket = "radiology-reports";
  eq(b, "radiology-reports");
});
test("invoice-pdfs bucket is a valid DownloadBucket", () => {
  const b: DownloadBucket = "invoice-pdfs";
  eq(b, "invoice-pdfs");
});

/**
 * Integration-style: simulate the exact branching DownloadFileButton uses
 * for each of the three tabs (lab / radiology / invoices) so a regression
 * in the shared code path is caught for all three at once.
 */
console.log("Simulated DownloadFileButton flow per tab");
type SignResult = { data: { signedUrl: string } | null; error: { message: string } | null };

async function simulateFlow(
  bucket: DownloadBucket,
  path: string,
  sign: (bucket: DownloadBucket, path: string) => Promise<SignResult>,
  headOk: boolean | "throw",
): Promise<{ error: string | null; success: boolean; bucket: DownloadBucket }> {
  const { data, error: signError } = await sign(bucket, path);
  if (signError || !data?.signedUrl) {
    return { error: getFriendlyDownloadError(signError?.message), success: false, bucket };
  }
  if (headOk === false) {
    return { error: DOWNLOAD_ERROR_MESSAGES.invalidUrl, success: false, bucket };
  }
  // headOk === "throw" → swallow and continue (matches component behavior)
  return { error: null, success: true, bucket };
}

for (const bucket of ["lab-reports", "radiology-reports", "invoice-pdfs"] as DownloadBucket[]) {
  test(`[${bucket}] shows notFound message + retry when signed URL is 404`, async () => {
    const out = await simulateFlow(
      bucket,
      "missing.pdf",
      async () => ({ data: null, error: { message: "Object not found" } }),
      true,
    );
    eq(out.success, false, "success");
    eq(out.error, DOWNLOAD_ERROR_MESSAGES.notFound, "error");
    eq(out.bucket, bucket, "bucket");
  });

  test(`[${bucket}] shows expired message + retry when signed URL is expired`, async () => {
    const out = await simulateFlow(
      bucket,
      "old.pdf",
      async () => ({ data: null, error: { message: "signed url expired" } }),
      true,
    );
    eq(out.success, false);
    eq(out.error, DOWNLOAD_ERROR_MESSAGES.expired);
  });

  test(`[${bucket}] shows invalidUrl message when HEAD check returns non-ok`, async () => {
    const out = await simulateFlow(
      bucket,
      "file.pdf",
      async () => ({ data: { signedUrl: "https://example.test/x.pdf" }, error: null }),
      false,
    );
    eq(out.success, false);
    eq(out.error, DOWNLOAD_ERROR_MESSAGES.invalidUrl);
  });

  test(`[${bucket}] succeeds after retry when signed URL becomes reachable`, async () => {
    let attempt = 0;
    const sign = async (): Promise<SignResult> => {
      attempt++;
      if (attempt === 1) return { data: null, error: { message: "Object not found" } };
      return { data: { signedUrl: "https://example.test/x.pdf" }, error: null };
    };
    const first = await simulateFlow(bucket, "file.pdf", sign, true);
    eq(first.success, false, "first attempt should fail");
    eq(first.error, DOWNLOAD_ERROR_MESSAGES.notFound);

    const retry = await simulateFlow(bucket, "file.pdf", sign, true);
    eq(retry.success, true, "retry should succeed");
    eq(retry.error, null);
  });
}

console.log("shouldPerformHeadCheck — adaptive policy");
test("first attempt (no history) → HEAD required", () => {
  const d = shouldPerformHeadCheck(INITIAL_HEAD_CHECK_STATE, 1_000_000);
  eq(d.shouldCheck, true, "shouldCheck");
  eq(d.reason, "first-attempt", "reason");
});
test("below success threshold → HEAD required", () => {
  const d = shouldPerformHeadCheck(
    { consecutiveSuccesses: HEAD_CHECK_DEFAULTS.successThreshold - 1, lastFailureAt: null },
    1_000_000,
  );
  eq(d.shouldCheck, true);
  eq(d.reason, "below-success-threshold");
});
test("at success threshold → HEAD skipped (trusted bucket)", () => {
  const d = shouldPerformHeadCheck(
    { consecutiveSuccesses: HEAD_CHECK_DEFAULTS.successThreshold, lastFailureAt: null },
    1_000_000,
  );
  eq(d.shouldCheck, false);
  eq(d.reason, "trusted-bucket");
});
test("far above threshold → HEAD skipped", () => {
  const d = shouldPerformHeadCheck({ consecutiveSuccesses: 99, lastFailureAt: null }, 1_000_000);
  eq(d.shouldCheck, false);
  eq(d.reason, "trusted-bucket");
});
test("recent failure within cool-down → HEAD required even with many successes", () => {
  const now = 1_000_000;
  const d = shouldPerformHeadCheck({ consecutiveSuccesses: 99, lastFailureAt: now - 1_000 }, now);
  eq(d.shouldCheck, true);
  eq(d.reason, "recent-failure");
});
test("failure older than cool-down + enough successes → HEAD skipped", () => {
  const now = 5_000_000;
  const d = shouldPerformHeadCheck(
    {
      consecutiveSuccesses: HEAD_CHECK_DEFAULTS.successThreshold,
      lastFailureAt: now - HEAD_CHECK_DEFAULTS.failureCoolDownMs - 1,
    },
    now,
  );
  eq(d.shouldCheck, false);
  eq(d.reason, "trusted-bucket");
});
test("custom successThreshold override respected", () => {
  const d = shouldPerformHeadCheck({ consecutiveSuccesses: 1, lastFailureAt: null }, 1_000_000, {
    successThreshold: 1,
  });
  eq(d.shouldCheck, false);
  eq(d.reason, "trusted-bucket");
});
test("custom failureCoolDownMs override respected", () => {
  const now = 1_000_000;
  const d = shouldPerformHeadCheck({ consecutiveSuccesses: 10, lastFailureAt: now - 100 }, now, {
    failureCoolDownMs: 50,
  });
  eq(d.shouldCheck, false, "cool-down passed under tight override");
  eq(d.reason, "trusted-bucket");
});

console.log("recordDownloadSuccess / recordDownloadFailure — state transitions");
test("success increments consecutiveSuccesses and clears lastFailureAt", () => {
  const next = recordDownloadSuccess({ consecutiveSuccesses: 2, lastFailureAt: 12345 });
  eq(next.consecutiveSuccesses, 3);
  eq(next.lastFailureAt, null);
});
test("failure resets consecutiveSuccesses and stamps lastFailureAt", () => {
  const next = recordDownloadFailure({ consecutiveSuccesses: 5, lastFailureAt: null }, 42);
  eq(next.consecutiveSuccesses, 0);
  eq(next.lastFailureAt, 42);
});

console.log("Adaptive HEAD-check — end-to-end per tab");
for (const bucket of ["lab-reports", "radiology-reports", "invoice-pdfs"] as DownloadBucket[]) {
  test(`[${bucket}] HEAD runs on first success, skipped after threshold`, () => {
    let state = INITIAL_HEAD_CHECK_STATE;
    const headCalls: number[] = [];
    let clock = 1_000_000;

    for (let i = 0; i < 6; i++) {
      const d = shouldPerformHeadCheck(state, clock);
      if (d.shouldCheck) headCalls.push(i);
      state = recordDownloadSuccess(state);
      clock += 1_000;
    }
    // First 3 clicks HEAD; subsequent 3 skip once bucket is trusted.
    eq(headCalls.length, HEAD_CHECK_DEFAULTS.successThreshold, "head-call count");
    eq(headCalls[0], 0);
    eq(
      headCalls[HEAD_CHECK_DEFAULTS.successThreshold - 1],
      HEAD_CHECK_DEFAULTS.successThreshold - 1,
    );
  });

  test(`[${bucket}] failure re-enables HEAD checks on the next click`, () => {
    // Bucket is trusted (past threshold, no failures).
    let state: { consecutiveSuccesses: number; lastFailureAt: number | null } = {
      consecutiveSuccesses: HEAD_CHECK_DEFAULTS.successThreshold + 5,
      lastFailureAt: null,
    };
    const now = 2_000_000;
    eq(shouldPerformHeadCheck(state, now).shouldCheck, false, "trusted before failure");

    // A failure happens.
    state = recordDownloadFailure(state, now);
    const afterFailure = shouldPerformHeadCheck(state, now + 500);
    eq(afterFailure.shouldCheck, true, "HEAD required right after failure");
    eq(afterFailure.reason, "recent-failure");
  });
}

console.log("formatSignedUrlValidity — UI hint for signed-URL lifetime");
test("default TTL formats to '5 دقيقة'", () => {
  eq(formatSignedUrlValidity(), "صالح لمدة 5 دقيقة");
});
test("SIGNED_URL_TTL_SECONDS default is 300s", () => {
  eq(SIGNED_URL_TTL_SECONDS, 300);
});
test("30s TTL formats in seconds", () => {
  eq(formatSignedUrlValidity(30), "صالح لمدة 30 ثانية");
});
test("120s TTL rounds to '2 دقيقة'", () => {
  eq(formatSignedUrlValidity(120), "صالح لمدة 2 دقيقة");
});
test("90s TTL rounds up to '2 دقيقة'", () => {
  eq(formatSignedUrlValidity(90), "صالح لمدة 2 دقيقة");
});
test("0 TTL yields empty string (hint hidden)", () => {
  eq(formatSignedUrlValidity(0), "");
});
test("negative TTL yields empty string", () => {
  eq(formatSignedUrlValidity(-10), "");
});
test("NaN TTL yields empty string", () => {
  eq(formatSignedUrlValidity(Number.NaN), "");
});

console.log("formatCountdown — live signed-URL countdown");
test("300s → '05:00' (full TTL)", () => {
  eq(formatCountdown(300), "05:00");
});
test("299.4s → '04:59' (floors seconds, no rounding up)", () => {
  eq(formatCountdown(299.4), "04:59");
});
test("65s → '01:05' (pads seconds < 10)", () => {
  eq(formatCountdown(65), "01:05");
});
test("60s → '01:00' (exact minute boundary)", () => {
  eq(formatCountdown(60), "01:00");
});
test("9s → '00:09' (pads minutes and seconds)", () => {
  eq(formatCountdown(9), "00:09");
});
test("0s → '00:00' (clamped)", () => {
  eq(formatCountdown(0), "00:00");
});
test("negative → '00:00' (clamped, no leading dash)", () => {
  eq(formatCountdown(-5), "00:00");
});
test("NaN → '00:00' (clamped)", () => {
  eq(formatCountdown(Number.NaN), "00:00");
});
test("Infinity → '00:00' (clamped, non-finite)", () => {
  eq(formatCountdown(Number.POSITIVE_INFINITY), "00:00");
});

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 100);
