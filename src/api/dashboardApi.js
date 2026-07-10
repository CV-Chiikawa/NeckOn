// frontend/src/api/dashboardApi.js
import api from "./client";

export const getTodayDashboard = () => api.get("/dashboard/today");
export const getWeeklyDashboard = () => api.get("/dashboard/weekly");
