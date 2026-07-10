import api from "./client";

export const saveLandmark = (payload) => api.post("/landmark", payload);
export const getLatestLandmark = () => api.get("/landmark/latest");
export const analyzePosture = (payload) => api.post("/posture/analyze", payload);
export const createPostureLog = (payload) => api.post("/posture/log", payload);
export const resetAiBaseline = (payload) => api.post("/posture/baseline", payload);
export const processPostureHeartbeat = (payload) => api.post("/posture/heartbeat", payload);
