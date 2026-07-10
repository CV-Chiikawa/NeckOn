import api from "./client";

export const getMyProfile = () => api.get("/users/me");
export const deleteMyProfile = () => api.delete("/users/me");
export const updateMyProfile = (formData) =>
  api.patch("/users/me", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
