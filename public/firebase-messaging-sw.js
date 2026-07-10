/* global importScripts, firebase */

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDQh4vW7zRo6MKy7AH8BaJqlWr_M-03-jg",
  authDomain: "sense-posture-system.firebaseapp.com",
  projectId: "sense-posture-system",
  storageBucket: "sense-posture-system.firebasestorage.app",
  messagingSenderId: "753161690845",
  appId: "1:753161690845:web:368012cc863d1238b08534",
  measurementId: "G-8Q953KEX3V",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload?.notification?.title || "Posture alert";
  const notificationOptions = {
    body: payload?.notification?.body || "Please check your posture.",
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
