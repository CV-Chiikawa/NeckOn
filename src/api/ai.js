const AI_SESSION_STORAGE_KEY = "ai_session_id";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function postAiForm(path, formData) {
  const response = await fetch(path, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `AI 요청에 실패했습니다. (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.path = path;
    throw error;
  }

  return data?.data ?? data?.result ?? data;
}

export function getAiSessionId() {
  const storedSessionId = localStorage.getItem(AI_SESSION_STORAGE_KEY);

  if (storedSessionId) {
    return storedSessionId;
  }

  const sessionId = crypto.randomUUID();
  localStorage.setItem(AI_SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

export function processAiFrame(blob, sessionId) {
  const formData = new FormData();
  formData.append("file", blob, "frame.jpg");
  formData.append("session_id", sessionId);

  return postAiForm("/ai/process-frame", formData);
}

export function resetAiSession(sessionId) {
  const formData = new FormData();
  formData.append("session_id", sessionId);

  return postAiForm("/ai/reset-session", formData);
}
