import { useEffect } from "react";
import { toast } from "sonner";
import { registerAppServiceWorker, type UpdateApplier } from "@/pwa-register";

/**
 * Mounts the guarded PWA registration and shows a bilingual sonner toast
 * when a new service-worker version is waiting to activate. Clicking the
 * action activates the new SW (SKIP_WAITING) and reloads the page.
 */
export function PwaUpdatePrompt() {
  useEffect(() => {
    let shown = false;
    const handleUpdate = (apply: UpdateApplier) => {
      if (shown) return;
      shown = true;
      toast("تحديث جديد متاح — New update available", {
        description:
          "أعد تحميل الصفحة لتطبيق آخر إصدار من التطبيق. Reload to apply the latest version.",
        duration: Infinity,
        action: {
          label: "تحديث الآن",
          onClick: () => apply(),
        },
        closeButton: true,
      });
    };
    registerAppServiceWorker({ onUpdateAvailable: handleUpdate });
  }, []);

  return null;
}
