import api from "./client";

export const createNotification = (payload) => api.post("/notifications", payload);
export const getNotifications = () => api.get("/notifications");
