import api from "./client";

export const registerDevice = (payload) => api.post("/devices/register", payload);
export const getDevices = () => api.get("/devices");
export const deleteDevice = (payload) => api.delete("/devices", { data: payload });
