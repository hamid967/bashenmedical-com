/* Service worker dedicated to Web Push notifications.
 * Kept separate from any offline/app-shell worker so caches are isolated.
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    try {
      data = { title: "إشعار", body: event.data ? event.data.text() : "" };
    } catch (_) {
      data = {};
    }
  }

  const title = data.title || "مجمع باعشن الطبي";
  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon.ico",
    badge: data.badge || "/favicon.ico",
    tag: data.tag || (data.metadata && data.metadata.appointment_id) || undefined,
    dir: "rtl",
    lang: "ar",
    renotify: !!data.renotify,
    requireInteraction: !!data.requireInteraction,
    data: {
      url: (data.metadata && data.metadata.url) || data.url || "/",
      appointmentId: data.metadata && data.metadata.appointment_id,
      kind: data.kind,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client) {
              await client.navigate(targetUrl);
            }
            return;
          }
        } catch (_) {
          /* ignore */
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

/* Browser rotates or invalidates the push subscription.
 * We can't re-subscribe from the SW without the VAPID key handy in a portable
 * way across restarts, so notify open clients to trigger a UI-driven resubscribe.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        try {
          client.postMessage({
            type: "pushsubscriptionchange",
            oldEndpoint: event.oldSubscription && event.oldSubscription.endpoint,
            newEndpoint: event.newSubscription && event.newSubscription.endpoint,
          });
        } catch (_) {
          /* ignore */
        }
      }
    })(),
  );
});

