import api from "./client";

export const login = (payload) => api.post("/auth/login", payload);
export const register = (formData) =>
  api.post("/auth/register", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
export const getAuthMe = () => api.get("/auth/me");
