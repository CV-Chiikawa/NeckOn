import api from "./client";

export const createContact = (formData) =>
  api.post("/contacts", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
