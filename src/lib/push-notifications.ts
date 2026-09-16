/**
 * ChopMboa — Push Notifications helper
 *
 * Enregistre le Service Worker, demande la permission Notification,
 * souscrit au Web Push via VAPID et envoie l'abonnement au backend.
 */

/** Clé publique VAPID injectée au build par Vite */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

/**
 * Enregistre le Service Worker si pas déjà fait.
 * Retourne la ServiceWorkerRegistration ou null si non supporté.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    console.log("[ChopMboa SW] Enregistré :", reg.scope);
    return reg;
  } catch (err) {
    console.warn("[ChopMboa SW] Échec d'enregistrement :", err);
    return null;
  }
}

/**
 * Demande la permission Notification à l'utilisateur.
 * Retourne true si accordée.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * Souscrit au Web Push et envoie l'abonnement au backend.
 * @param restaurantId — L'identifiant du restaurant pour filtrer les notifs
 */
export async function subscribeToPush(restaurantId?: string): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY) {
    console.warn("[ChopMboa Push] VITE_VAPID_PUBLIC_KEY non défini — push désactivé.");
    return false;
  }

  const granted = await requestNotificationPermission();
  if (!granted) return false;

  const reg = await registerServiceWorker();
  if (!reg) return false;

  try {
    // Vérifier s'il y a déjà un abonnement existant
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = subscription.toJSON();
    // Envoyer l'abonnement au backend
    await fetch("/api/actions/push.subscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        restaurantId,
      }),
    });

    console.log("[ChopMboa Push] Abonnement push actif.");
    return true;
  } catch (err) {
    console.warn("[ChopMboa Push] Échec d'abonnement :", err);
    return false;
  }
}

/**
 * Se désabonne des push et notifie le backend.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetch("/api/actions/push.unsubscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

/**
 * Retourne l'état actuel de la permission Notification.
 */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}
