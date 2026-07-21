/**
 * Verifies that the Undo (`manage.undo.*`) copy on /reservations/manage
 * uses i18n with the `{{seconds}}` interpolation instead of hardcoded text,
 * and that both AR and EN resolve identically through `useI18n().t(...)`.
 */
import { describe, it, expect } from "bun:test";
import i18n from "@/lib/i18n/config";
import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import urCommon from "@/locales/ur/common.json";

const INTERPOLATED_KEYS = [
  "manage.undo.button_active",
  "manage.undo.aria_active",
] as const;

const STATIC_KEYS = [
  "manage.undo.restored_title",
  "manage.undo.button_pending",
  "manage.undo.button_expired",
  "manage.undo.aria_expired",
  "manage.undo.expired_note",
  "manage.undo.toast_success",
  "manage.undo.toast_failed",
  "manage.undo.close",
] as const;

describe("manage.undo.* i18n", () => {
  it("declares {{seconds}} placeholder in AR + EN + UR sources", () => {
    for (const key of INTERPOLATED_KEYS) {
      expect((arCommon as Record<string, string>)[key]).toContain("{{seconds}}");
      expect((enCommon as Record<string, string>)[key]).toContain("{{seconds}}");
      expect((urCommon as Record<string, string>)[key]).toContain("{{seconds}}");
    }
  });

  it("has parity — every AR key exists in EN and UR (and vice versa)", () => {
    const arKeys = Object.keys(arCommon).filter((k) => k.startsWith("manage.undo.")).sort();
    const enKeys = Object.keys(enCommon).filter((k) => k.startsWith("manage.undo.")).sort();
    const urKeys = Object.keys(urCommon).filter((k) => k.startsWith("manage.undo.")).sort();
    expect(enKeys).toEqual(arKeys);
    expect(urKeys).toEqual(arKeys);
  });

  it("interpolates {{seconds}} in Arabic via t()", async () => {
    await i18n.changeLanguage("ar");
    const out = i18n.t("manage.undo.button_active", { seconds: 17, ns: "common" });
    expect(out).toContain("17");
    expect(out).not.toContain("{{seconds}}");

    const aria = i18n.t("manage.undo.aria_active", { seconds: 5, ns: "common" });
    expect(aria).toContain("5");
    expect(aria).not.toContain("{{seconds}}");
  });

  it("interpolates {{seconds}} in English via t()", async () => {
    await i18n.changeLanguage("en");
    const out = i18n.t("manage.undo.button_active", { seconds: 30, ns: "common" });
    expect(out).toBe("Undo cancellation (30s)");

    const aria = i18n.t("manage.undo.aria_active", { seconds: 1, ns: "common" });
    expect(aria).toBe("Undo cancellation, 1 seconds remaining");
  });

  it("resolves static undo keys to non-empty, non-raw values in AR/EN/UR", async () => {
    for (const lang of ["ar", "en", "ur"] as const) {
      await i18n.changeLanguage(lang);
      for (const key of STATIC_KEYS) {
        const val = i18n.t(key, { ns: "common" });
        expect(val).toBeTruthy();
        expect(val).not.toBe(key);
      }
    }
  });

  it("interpolates {{seconds}} in Urdu via t() using ur/common.json", async () => {
    await i18n.changeLanguage("ur");
    const out = i18n.t("manage.undo.button_active", { seconds: 22, ns: "common" });
    expect(out).toContain("22");
    expect(out).not.toContain("{{seconds}}");
    // Uses the Urdu source, not the AR fallback.
    expect(out).toBe(urCommon["manage.undo.button_active"].replace("{{seconds}}", "22"));

    const aria = i18n.t("manage.undo.aria_active", { seconds: 9, ns: "common" });
    expect(aria).toContain("9");
    expect(aria).toBe(urCommon["manage.undo.aria_active"].replace("{{seconds}}", "9"));
  });

  it("uses the source file text verbatim when no params are passed", async () => {
    await i18n.changeLanguage("ar");
    expect(i18n.t("manage.undo.restored_title", { ns: "common" })).toBe(
      arCommon["manage.undo.restored_title"],
    );
    await i18n.changeLanguage("en");
    expect(i18n.t("manage.undo.restored_title", { ns: "common" })).toBe(
      enCommon["manage.undo.restored_title"],
    );
  });
});
