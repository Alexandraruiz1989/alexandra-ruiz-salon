const CACHE_NAME = "alexandra-ruiz-salon-v1";
const DEFAULT_NOTIFICATION_URL = "/admin/notificaciones";
const DEFAULT_ICON = "/logo-alexandra-ruiz.png";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (error) {
      payload = {
        body: event.data.text(),
      };
    }
  }

  const title = payload.title || "Alexandra Ruiz Salón";
  const options = {
    body: payload.body || "Tienes una nueva notificación.",
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_ICON,
    tag: payload.notification_id || payload.type || "alexandra-ruiz-salon",
    renotify: Boolean(payload.notification_id),
    data: {
      url: payload.url || DEFAULT_NOTIFICATION_URL,
      notification_id: payload.notification_id || null,
      type: payload.type || "notificacion",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || DEFAULT_NOTIFICATION_URL;
  const url = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);

          if (
            clientUrl.origin === self.location.origin &&
            clientUrl.pathname === new URL(url).pathname &&
            "focus" in client
          ) {
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }

        return undefined;
      })
  );
});
