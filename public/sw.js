/**
 * ChopMboa — Service Worker
 * Gère les notifications push en arrière-plan (Web Push API).
 * Ce fichier est servi statiquement depuis /sw.js et enregistré
 * par src/main.tsx au démarrage de l'application.
 */

const CACHE_NAME = "chopmboa-v1";

// Installation — pas de précache, uniquement push
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Réception d'un push venant du serveur.
 * Le payload JSON attendu :
 * {
 *   title: string,
 *   body: string,
 *   icon?: string,
 *   badge?: string,
 *   tag?: string,        // déduplique les notifications du même type
 *   url?: string,        // URL à ouvrir au clic
 *   data?: object
 * }
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "ChopMboa", body: event.data.text() };
  }

  const {
    title = "ChopMboa",
    body = "",
    icon = "/logo.svg",
    badge = "/logo.svg",
    tag,
    url = "/",
    data = {},
  } = payload;

  const options = {
    body,
    icon,
    badge,
    tag,
    data: { url, ...data },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Clic sur la notification — ouvre ou focus l'onglet correspondant.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Si un onglet est déjà ouvert sur ce domaine, on le focus
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        // Sinon ouvrir un nouvel onglet
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
