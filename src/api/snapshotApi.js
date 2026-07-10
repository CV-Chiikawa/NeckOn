import api from "./client";

export const getSnapshots = () => api.get("/snapshots");

export const uploadSnapshot = (formData) =>
  api.post("/snapshots", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const deleteSnapshots = (ids) =>
  api.delete("/snapshots", {
    data: { ids },
  });
