const DEFAULT_AI_POSTURE_TIMEOUT_MS = 2500;
const AI_STATE_TO_STATUS = {
  GOOD: 'normal',
  CAUTION: 'warning',
  BAD: 'danger',
};

function getAiPostureBaseUrl() {
  return (process.env.AI_POSTURE_API_URL || '').replace(/\/+$/, '');
}

function isAiPostureEnabled() {
  return process.env.AI_POSTURE_ENABLED === 'true' && Boolean(getAiPostureBaseUrl());
}

function getTimeoutMs() {
  const timeoutMs = Number(process.env.AI_POSTURE_TIMEOUT_MS);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_AI_POSTURE_TIMEOUT_MS;
  }

  return Math.round(timeoutMs);
}

function normalizeAiResult(result) {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const state = String(result.state || '').toUpperCase();
  const status = AI_STATE_TO_STATUS[state] || null;

  return {
    ...result,
    state,
    status,
  };
}

async function postToAi(path, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(`${getAiPostureBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AI posture service responded with ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function analyzePostureWithAi({ userId, frameDataUrl }) {
  if (!isAiPostureEnabled() || !frameDataUrl) {
    return null;
  }

  const result = await postToAi('/process-frame', {
    session_id: String(userId),
    frame_data_url: frameDataUrl,
  });

  return normalizeAiResult(result);
}

async function resetAiPostureSession(userId) {
  if (!isAiPostureEnabled()) {
    return {
      enabled: false,
      reset: false,
      reason: 'ai_posture_disabled',
    };
  }

  const result = await postToAi('/reset-session', {
    session_id: String(userId),
  });

  return {
    enabled: true,
    reset: true,
    ...result,
  };
}

module.exports = {
  analyzePostureWithAi,
  isAiPostureEnabled,
  resetAiPostureSession,
};
