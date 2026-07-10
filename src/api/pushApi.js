import api from "./client";

export const sendPushNotification = (payload) => api.post("/push/send", payload);
