import { registerDevice } from "./api/deviceApi";

const FIREBASE_APP_URL = "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
const FIREBASE_MESSAGING_URL = "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDQh4vW7zRo6MKy7AH8BaJqlWr_M-03-jg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sense-posture-system.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sense-posture-system",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sense-posture-system.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "753161690845",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID || "1:753161690845:web:368012cc863d1238b08534",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-8Q953KEX3V",
};

const vapidKey =
  import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  "BMKEUGDT1bsAcLcEL_K2O_6VQvQEJfhxB2jroQLc6j-fNJtm_uzOEg8dXg_LRrVOF-mBr-f1G_rGLk_C1-ezpFU";

let messagingModulePromise;
let serviceWorkerRegistrationPromise;

async function loadMessagingModules() {
  if (!messagingModulePromise) {
    messagingModulePromise = Promise.all([
      import(/* @vite-ignore */ FIREBASE_APP_URL),
      import(/* @vite-ignore */ FIREBASE_MESSAGING_URL),
    ]);
  }

  return messagingModulePromise;
}

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    window.isSecureContext
  );
}

async function getFirebaseMessaging() {
  const [{ initializeApp, getApp, getApps }, { getMessaging }] = await loadMessagingModules();
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  return getMessaging(app);
}

function waitForServiceWorkerActivation(serviceWorker) {
  if (!serviceWorker || serviceWorker.state === "activated") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      serviceWorker.removeEventListener("statechange", handleStateChange);
      reject(new Error("Firebase messaging service worker activation timed out."));
    }, 10000);

    function handleStateChange() {
      if (serviceWorker.state === "activated") {
        window.clearTimeout(timeoutId);
        serviceWorker.removeEventListener("statechange", handleStateChange);
        resolve();
      }
    }

    serviceWorker.addEventListener("statechange", handleStateChange);
  });
}

async function registerMessagingServiceWorker() {
  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = (async () => {
      const existingRegistration = await navigator.serviceWorker.getRegistration("/");
      const registration =
        existingRegistration ||
        (await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
          scope: "/",
        }));

      await waitForServiceWorkerActivation(
        registration.active || registration.waiting || registration.installing
      );

      return registration;
    })();
  }

  return serviceWorkerRegistrationPromise;
}

export async function requestFcmTokenForCurrentBrowser() {
  if (!isPushSupported()) {
    return { registered: false, reason: "unsupported" };
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return { registered: false, reason: "permission_denied" };
  }

  const [, { getToken }] = await loadMessagingModules();
  const messaging = await getFirebaseMessaging();
  const serviceWorkerRegistration = await registerMessagingServiceWorker();
  const fcmToken = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration,
  });

  if (!fcmToken) {
    return { registered: false, reason: "token_unavailable" };
  }

  return { registered: true, fcmToken };
}

export async function registerFcmTokenForCurrentBrowser(fcmToken) {
  if (!fcmToken) {
    return { registered: false, reason: "token_unavailable" };
  }

  await registerDevice({
    device_type: "web",
    fcm_token: fcmToken,
  });

  return { registered: true, fcmToken };
}

export async function registerFcmDeviceForCurrentBrowser() {
  const tokenResult = await requestFcmTokenForCurrentBrowser();

  if (!tokenResult.registered) {
    return tokenResult;
  }

  return registerFcmTokenForCurrentBrowser(tokenResult.fcmToken);
}
