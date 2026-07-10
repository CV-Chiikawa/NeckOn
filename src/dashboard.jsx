import "./dashboard.css";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { getMyProfile } from "./api/userApi";
import {
  getLatestLandmark,
  saveLandmark as saveLandmarkApi,
  processPostureHeartbeat,
} from "./api/postureApi";
import { uploadSnapshot } from "./api/snapshotApi";
import { getAiSessionId, processAiFrame, resetAiSession } from "./api/ai";
import { createNotification as createNotificationApi } from "./api/notificationApi";
import { getDevices } from "./api/deviceApi";
import { sendPushNotification } from "./api/pushApi";


const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const MEDIAPIPE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

const LANDMARK_INDEX = {
  nose: 0,
  left_ear: 7,
  right_ear: 8,
  mouth_left: 9,
  mouth_right: 10,
  left_shoulder: 11,
  right_shoulder: 12,
};

const MIN_VISIBILITY = 0.4;
const NOTIFICATION_COOLDOWN_MS = 10000;
const GRAPH_WINDOW_MS = 60000;
const GRAPH_WIDTH = 300;
const GRAPH_HEIGHT = 150;
const GRAPH_PADDING = 20;
const AI_FRAME_INTERVAL_MS = 150;
const METRIC_DISPLAY_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 500;
const AI_MAX_CONSECUTIVE_ERRORS = 3;

async function createPoseLandmarkerWithFallback(vision) {
  const delegates = ["GPU", "CPU"];
  let lastError = null;

  for (const delegate of delegates) {
    try {
      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_MODEL_URL,
          delegate,
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });

      return { poseLandmarker, delegate };
    } catch (error) {
      lastError = error;
      console.error(`PoseLandmarker ${delegate} 초기화 실패:`, error);
    }
  }

  throw lastError;
}

function toLandmarkPoint(landmark) {
  if (!landmark) {
    return null;
  }

  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: landmark.visibility ?? 0,
  };
}

function buildPosePayload(poseLandmarks) {
  if (!poseLandmarks) {
    return null;
  }

  const landmarks = {
    nose: toLandmarkPoint(poseLandmarks[LANDMARK_INDEX.nose]),
    left_ear: toLandmarkPoint(poseLandmarks[LANDMARK_INDEX.left_ear]),
    right_ear: toLandmarkPoint(poseLandmarks[LANDMARK_INDEX.right_ear]),
    left_shoulder: toLandmarkPoint(poseLandmarks[LANDMARK_INDEX.left_shoulder]),
    right_shoulder: toLandmarkPoint(poseLandmarks[LANDMARK_INDEX.right_shoulder]),
    mouth_left: toLandmarkPoint(poseLandmarks[LANDMARK_INDEX.mouth_left]),
    mouth_right: toLandmarkPoint(poseLandmarks[LANDMARK_INDEX.mouth_right]),
  };

  const requiredKeys = [
    "nose",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
  ];

  const hasAllRequiredLandmarks = requiredKeys.every((key) => {
    const point = landmarks[key];
    return point && point.visibility >= MIN_VISIBILITY;
  });

  if (!hasAllRequiredLandmarks) {
    return null;
  }

  return {
    reference_side: "right",
    landmarks,
  };
}

function createNotificationMessage(status) {
  if (status === "danger") {
    return {
      title: "자세 알림",
      message: "자세가 일정 시간 이상 무너졌습니다.",
    };
  }

  if (status === "warning") {
    return {
      title: "자세 알림",
      message: "자세가 흐트러지고 있습니다. 바른 자세로 다시 앉아 주세요.",
    };
  }

  return null;
}

function toHeartbeatStatus(status) {
  if (status === "normal") {
    return "good";
  }

  if (status === "warning") {
    return "caution";
  }

  if (status === "danger") {
    return "bad";
  }

  return null;
}

function getStatusFromAiResult(aiResult) {
  if (!aiResult) {
    return null;
  }

  const state = String(aiResult.state || "").toLowerCase();

  if (
    aiResult.show_bad_alert ||
    ["bad", "danger", "incorrect", "forward_head", "forward-head"].includes(state)
  ) {
    return "danger";
  }

  if (["warning", "warn", "caution"].includes(state)) {
    return "warning";
  }

  if (["good", "normal", "ok"].includes(state)) {
    return "normal";
  }

  return null;
}

function getGraphColorByStatus(status) {
  if (status === "danger") {
    return "#C15555";
  }

  if (status === "warning") {
    return "#A58E34";
  }

  return "#889B6C";
}

function getGraphScoreByStatus(status) {
  if (status === "danger") {
    return 1;
  }

  if (status === "warning") {
    return 2;
  }

  return 3;
}

function buildLineChartPoints(samples) {
  if (samples.length === 0) {
    return [];
  }

  const drawableWidth = GRAPH_WIDTH - GRAPH_PADDING * 2;
  const drawableHeight = GRAPH_HEIGHT - GRAPH_PADDING * 2;
  const scoreToY = {
    3: GRAPH_PADDING + drawableHeight * 0.2,
    2: GRAPH_PADDING + drawableHeight * 0.5,
    1: GRAPH_PADDING + drawableHeight * 0.8,
  };

  return samples.map((sample, index) => {
    const x =
      samples.length === 1
        ? GRAPH_WIDTH / 2
        : GRAPH_PADDING + (drawableWidth * index) / (samples.length - 1);
    const score = getGraphScoreByStatus(sample.status);
    const y = scoreToY[score];

    return {
      ...sample,
      score,
      x,
      y,
    };
  });
}

function parseAiInfoLines(infoLines = []) {
  const keyMap = {
    CVA: "cva",
    EarForward: "earForward",
    DeltaCVA: "deltaCva",
    ViewQuality: "viewQuality",
    Reasons: "reasons",
    ViewState: "viewState",
    HeadTilt: "headTilt",
    ShoulderTilt: "shoulderTilt",
  };

  return infoLines.reduce((parsed, line) => {
    const [rawKey, ...valueParts] = String(line).split(":");
    const key = keyMap[rawKey?.trim()];
    const value = valueParts.join(":").trim();

    if (key && value) {
      parsed[key] = value;
    }

    return parsed;
  }, {});
}

function formatAiNumber(value, digits) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "-";
}

function Dashboard() {
  const navigate = useNavigate();
  const [soundOn, setSoundOn] = useState(true);
  const [status, setStatus] = useState("normal");
  const [displayName, setDisplayName] = useState("사용자");
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isPoseReady, setIsPoseReady] = useState(false);
  const [hasBaseline, setHasBaseline] = useState(false);
  const [isAnalysisPaused, setIsAnalysisPaused] = useState(false);
  const [isManualAnalyzing, setIsManualAnalyzing] = useState(false);
  const [isDetectorReady, setIsDetectorReady] = useState(false);
  const [detectorMode, setDetectorMode] = useState("대기 중");
  const [detectorError, setDetectorError] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("unsupported");
  const [notificationDebugMessage, setNotificationDebugMessage] = useState(
    "브라우저 알림 상태를 확인하는 중입니다."
  );
  const [registeredDeviceCount, setRegisteredDeviceCount] = useState(0);
  const [recentLogPoints, setRecentLogPoints] = useState([]);
  const [aiResult, setAiResult] = useState(null);
  const [metricAiResult, setMetricAiResult] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const aiFrameIntervalRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraStartingRef = useRef(null);
  const latestPayloadRef = useRef(null);
  const isAiFrameSendingRef = useRef(false);
  const isAnalysisPausedRef = useRef(false);
  const isAiFramePausedRef = useRef(false);
  const aiConsecutiveErrorCountRef = useRef(0);
  const sendCurrentAiFrameRef = useRef(null);
  const hasBaselineRef = useRef(false);
  const soundOnRef = useRef(true);
  const lastNotifiedStatusRef = useRef("normal");
  const lastNotificationAtRef = useRef(0);
  const lastMetricDisplayAtRef = useRef(0);
  const lastHeartbeatStatusRef = useRef(null);
  const lastHeartbeatAtRef = useRef(0);
  const audioContextRef = useRef(null);
  const currentUserIdRef = useRef(null);
  const registeredDeviceCountRef = useRef(0);

  const statusText = {
    normal: "정상",
    warning: "경고",
    danger: "비정상",
  };

  const alertBannerMessage =
    status === "warning"
      ? "경고: 자세가 흐트러지고 있습니다. 목과 어깨 정렬을 다시 맞춰 주세요."
      : status === "danger"
        ? "비정상: 자세가 많이 무너졌습니다. 지금 바로 자세를 교정해 주세요."
        : "";
  const visibleRecentLogPoints = recentLogPoints.slice(-8);
  const chartPoints = buildLineChartPoints(visibleRecentLogPoints);
  const chartPath = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const parsedAiInfo = parseAiInfoLines(metricAiResult?.info_lines);
  const isFrontMode = metricAiResult?.mode === "FRONT";
  const firstMetricLabel = isFrontMode ? "머리 기울기" : "귀-어깨 거리";
  const firstMetricValue = isFrontMode
    ? formatAiNumber(parsedAiInfo.headTilt, 3)
    : formatAiNumber(parsedAiInfo.earForward, 3);
  const secondMetricLabel = isFrontMode ? "어깨 수평도" : "목 기울기 각도";
  const secondMetricValue = isFrontMode
    ? formatAiNumber(parsedAiInfo.shoulderTilt, 3)
    : formatAiNumber(parsedAiInfo.cva, 1);
  const statusCardText = aiResult?.state || statusText[status];
  const currentMode = aiResult?.mode || "";

  const assignStreamToVideo = async (stream) => {
    const video = videoRef.current;

    if (!video || !stream) {
      return;
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream;
      console.debug("srcObject assigned");
    }

    await video.play();
    console.debug("play success");
  };

  const attachVideoRef = (element) => {
    videoRef.current = element;

    if (element && cameraStreamRef.current) {
      assignStreamToVideo(cameraStreamRef.current).catch((error) => {
        console.error("Camera video reattach failed:", {
          name: error?.name,
          message: error?.message,
        });
      });
    }
  };

  const ensureAudioContextReady = async () => {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContextClass();
    }

    if (audioContextRef.current.state === "suspended") {
      try {
        await audioContextRef.current.resume();
      } catch (error) {
        console.error("오디오 컨텍스트 재개 실패:", error);
        return null;
      }
    }

    return audioContextRef.current;
  };

  const playTone = (audioContext, frequency, startAt, duration, peakGain) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
  };

  const playAlertSound = async (nextStatus) => {
    if (!soundOnRef.current || nextStatus === "normal") {
      return;
    }

    const audioContext = await ensureAudioContextReady();

    if (!audioContext) {
      return;
    }

    const startAt = audioContext.currentTime + 0.01;

    if (nextStatus === "danger") {
      playTone(audioContext, 880, startAt, 0.18, 0.18);
      playTone(audioContext, 740, startAt + 0.22, 0.22, 0.2);
      return;
    }

    playTone(audioContext, 660, startAt, 0.24, 0.14);
  };

  const sendHeartbeatStatus = async (nextStatus) => {
    const heartbeatStatus = toHeartbeatStatus(nextStatus);

    if (!heartbeatStatus) {
      return;
    }

    const now = Date.now();
    const shouldSendHeartbeat =
      lastHeartbeatStatusRef.current !== heartbeatStatus ||
      now - lastHeartbeatAtRef.current >= HEARTBEAT_INTERVAL_MS;

    if (!shouldSendHeartbeat) {
      return;
    }

    try {
      const response = await processPostureHeartbeat({ status: heartbeatStatus });
      lastHeartbeatStatusRef.current = heartbeatStatus;
      lastHeartbeatAtRef.current = now;

      if (
        heartbeatStatus === "bad" &&
        response.data?.data?.alert?.triggered
      ) {
        await saveCurrentCameraSnapshot();
      }
    } catch (error) {
      console.error("자세 측정 시간 갱신 실패:", error);
    }
  };

  const captureCurrentCameraFrame = async () => {
    const video = videoRef.current;

    if (
      !video ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return null;
    }

    const snapshotCanvas = document.createElement("canvas");
    snapshotCanvas.width = video.videoWidth;
    snapshotCanvas.height = video.videoHeight;

    const context = snapshotCanvas.getContext("2d");

    if (!context) {
      return null;
    }

    // Match the mirrored webcam preview shown to the user.
    context.translate(snapshotCanvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);

    return new Promise((resolve) => {
      snapshotCanvas.toBlob(resolve, "image/jpeg", 0.9);
    });
  };

  const saveCurrentCameraSnapshot = async () => {
    try {
      const blob = await captureCurrentCameraFrame();

      if (!blob) {
        return;
      }

      const formData = new FormData();
      formData.append(
        "snapshot_image",
        blob,
        `snapshot-${Date.now()}.jpg`
      );

      await uploadSnapshot(formData);
    } catch (error) {
      if (error.response?.status === 403) {
        return;
      }

      console.error("스냅샷 저장 실패:", error);
    }
  };

  const triggerStatusNotification = async (nextStatus) => {
    const notificationContent = createNotificationMessage(nextStatus);

    if (!notificationContent) {
      lastNotifiedStatusRef.current = "normal";
      setNotificationDebugMessage(
        soundOn
          ? "정상 자세입니다. 화면 알림과 브라우저 알림이 대기 중입니다."
          : "정상 자세입니다. 알림 소리가 꺼져 있어 화면 경고만 유지됩니다."
      );
      return;
    }

    const now = Date.now();
    const shouldSkipDuplicate =
      lastNotifiedStatusRef.current === nextStatus &&
      now - lastNotificationAtRef.current < NOTIFICATION_COOLDOWN_MS;

    if (shouldSkipDuplicate) {
      setNotificationDebugMessage(
        "같은 경고 상태가 반복되어 브라우저 알림을 잠시 대기 중입니다."
      );
      return;
    }

    lastNotifiedStatusRef.current = nextStatus;
    lastNotificationAtRef.current = now;

    await playAlertSound(nextStatus);

    try {
      await createNotificationApi({
        status: nextStatus,
        message: notificationContent.message,
      });
    } catch (error) {
      console.error("알림 저장 실패:", error);
      setNotificationDebugMessage("알림 기록 저장에는 실패했지만 화면 경고는 유지됩니다.");
    }

    if (!soundOnRef.current) {
      setNotificationDebugMessage(
        "알림 소리가 꺼져 있습니다. 화면 경고만 표시하고 소리와 브라우저 알림은 보내지 않습니다."
      );
      return;
    }

    if (registeredDeviceCountRef.current > 0 && currentUserIdRef.current) {
      try {
        await sendPushNotification({
          user_id: currentUserIdRef.current,
          title: notificationContent.title,
          body: notificationContent.message,
        });
      } catch (error) {
        console.error("푸시 알림 전송 실패:", error);
        setNotificationDebugMessage(
          error.response?.data?.message ||
            "등록된 기기가 있지만 푸시 알림 전송에 실패했습니다."
        );
      }
    }

    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setNotificationDebugMessage("이 브라우저는 시스템 알림을 지원하지 않습니다.");
      return;
    }

    if (Notification.permission === "default") {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
      } catch (error) {
        console.error("브라우저 알림 권한 요청 실패:", error);
        setNotificationDebugMessage("브라우저 알림 권한 요청에 실패했습니다.");
      }
    }

    if (Notification.permission === "granted") {
      try {
        new Notification(notificationContent.title, {
          body: notificationContent.message,
          tag: `posture-${nextStatus}`,
        });
        setNotificationDebugMessage("브라우저 알림을 전송했습니다.");
      } catch (error) {
        console.error("브라우저 알림 표시 실패:", error);
        setNotificationDebugMessage("브라우저 알림 표시에는 실패했지만 화면 경고는 표시 중입니다.");
      }
      return;
    }

    if (Notification.permission === "denied") {
      setNotificationPermission("denied");
      setNotificationDebugMessage(
        "브라우저 알림이 차단되어 있습니다. 주소창의 알림 권한을 허용으로 바꿔 주세요."
      );
      return;
    }

    setNotificationPermission(Notification.permission);
    setNotificationDebugMessage("브라우저 알림 권한을 아직 허용하지 않았습니다.");
  };

  const sendCurrentAiFrame = async ({ force = false } = {}) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (
      isAnalysisPausedRef.current ||
      (!force && isAiFramePausedRef.current) ||
      !video ||
      !canvas ||
      isAiFrameSendingRef.current ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return null;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    isAiFrameSendingRef.current = true;

    try {
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.8);
      });

      if (!blob) {
        throw new Error("프레임 blob 생성 실패");
      }

      const sessionId = getAiSessionId();
      const result = await processAiFrame(blob, sessionId);
      const nextStatus = getStatusFromAiResult(result);
      const resultInfo = parseAiInfoLines(result?.info_lines);
      const now = Date.now();
      const shouldUpdateMetricDisplay =
        force ||
        lastMetricDisplayAtRef.current === 0 ||
        now - lastMetricDisplayAtRef.current >= METRIC_DISPLAY_INTERVAL_MS;

      aiConsecutiveErrorCountRef.current = 0;
      isAiFramePausedRef.current = false;
      setAiResult(result);

      if (shouldUpdateMetricDisplay) {
        lastMetricDisplayAtRef.current = now;
        setMetricAiResult(result);
      }

      if (nextStatus) {
        setStatus(nextStatus);
        if (shouldUpdateMetricDisplay) {
          setRecentLogPoints((prev) => {
            const nextPoint = {
              id: `${now}-${nextStatus}`,
              timestamp: now,
              status: nextStatus,
              state: result.state,
              mode: result.mode,
              reasons: resultInfo.reasons,
              viewQuality: resultInfo.viewQuality,
            };

            return [
              ...prev.filter((point) => now - point.timestamp <= GRAPH_WINDOW_MS),
              nextPoint,
            ];
          });
        }
        await sendHeartbeatStatus(nextStatus);
        await triggerStatusNotification(nextStatus);
      }

      return result;
    } catch (error) {
      aiConsecutiveErrorCountRef.current += 1;

      if (
        !force &&
        aiConsecutiveErrorCountRef.current >= AI_MAX_CONSECUTIVE_ERRORS
      ) {
        isAiFramePausedRef.current = true;
        isAnalysisPausedRef.current = true;
        setIsAnalysisPaused(true);
      }
      throw error;
    } finally {
      isAiFrameSendingRef.current = false;
    }
  };

  sendCurrentAiFrameRef.current = sendCurrentAiFrame;

  const handleToggleAnalysis = async () => {
    if (!isAnalysisPaused) {
      isAnalysisPausedRef.current = true;
      setIsAnalysisPaused(true);
      return;
    }

    try {
      await ensureAudioContextReady();
      setIsManualAnalyzing(true);
      aiConsecutiveErrorCountRef.current = 0;
      isAiFramePausedRef.current = false;
      isAnalysisPausedRef.current = false;
      setIsAnalysisPaused(false);
      await sendCurrentAiFrame({ force: true });
    } catch (err) {
      isAnalysisPausedRef.current = true;
      setIsAnalysisPaused(true);
      console.error(err);
      alert(err.message || "AI 자세 분석에 실패했습니다.");
    } finally {
      setIsManualAnalyzing(false);
    }
  };

  const handleSaveLandmark = async () => {
    if (!latestPayloadRef.current) {
      alert("기준 자세를 저장할 수 있도록 카메라 앞에 앉아주세요.");
      return;
    }

    try {
      await ensureAudioContextReady();
      await saveLandmarkApi(latestPayloadRef.current);
      const sessionId = getAiSessionId();

      setAiResult(null);
      setMetricAiResult(null);
      lastMetricDisplayAtRef.current = 0;
      aiConsecutiveErrorCountRef.current = 0;
      isAnalysisPausedRef.current = false;
      isAiFramePausedRef.current = false;
      setIsAnalysisPaused(false);
      setHasBaseline(true);

      try {
        await resetAiSession(sessionId);
      } catch (resetError) {
        console.error("AI 세션 리셋 실패:", resetError);
        isAiFramePausedRef.current = true;
      }

      alert("기준 자세 저장 완료");
    } catch (err) {
      console.error(err);
      const message =
        err.response?.data?.message ||
        err.message ||
        "기준 자세 저장에 실패했습니다.";
      alert(message);
    }
  };

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    hasBaselineRef.current = hasBaseline;
  }, [hasBaseline]);

  useEffect(() => {
    if (!soundOn && audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [soundOn]);

  useEffect(() => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setNotificationDebugMessage("이 브라우저는 시스템 알림을 지원하지 않습니다.");
      return;
    }

    setNotificationPermission(Notification.permission);

    if (Notification.permission === "default") {
      Notification.requestPermission().catch((error) => {
        console.error("브라우저 알림 권한 요청 실패:", error);
        setNotificationDebugMessage("브라우저 알림 권한 요청에 실패했습니다.");
      });
      setNotificationDebugMessage("브라우저 알림 권한을 요청했습니다.");
      return;
    }

    if (Notification.permission === "granted") {
      setNotificationDebugMessage("브라우저 알림이 허용되어 있습니다.");
      return;
    }

    setNotificationDebugMessage(
      "브라우저 알림이 차단되어 있습니다. 주소창의 알림 권한을 확인해 주세요."
    );
  }, []);

  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        const profileRes = await getMyProfile();
        const userData = profileRes.data.data;
        currentUserIdRef.current = userData.id;
        setDisplayName(userData.nickname || userData.username || "사용자");
      } catch (error) {
        console.error("사용자 정보 불러오기 실패:", error);
      }

      try {
        const devicesRes = await getDevices();
        const devices = Array.isArray(devicesRes.data) ? devicesRes.data : [];
        registeredDeviceCountRef.current = devices.length;
        setRegisteredDeviceCount(devices.length);
      } catch (error) {
        console.error("등록 기기 조회 실패:", error);
      }

      try {
        await getLatestLandmark();
        setHasBaseline(true);
      } catch (error) {
        if (error.response?.status !== 404) {
          console.error("기준 자세 확인 실패:", error);
        }
      }
    };

    initializeDashboard();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const isLiveStream = (stream) => {
      return Boolean(
        stream?.getVideoTracks().some((track) => track.readyState === "live")
      );
    };

    const getCameraStream = async () => {
      if (isLiveStream(cameraStreamRef.current)) {
        return cameraStreamRef.current;
      }

      if (!cameraStartingRef.current) {
        console.debug("camera init start");
        cameraStartingRef.current = navigator.mediaDevices
          .getUserMedia({
            video: {
              width: 1280,
              height: 720,
              facingMode: "user",
            },
          })
          .then((stream) => {
            console.debug("getUserMedia success");
            cameraStreamRef.current = stream;
            return stream;
          })
          .finally(() => {
            cameraStartingRef.current = null;
          });
      }

      return cameraStartingRef.current;
    };

    const setupCameraAndDetector = async () => {
      try {
        setDetectorError("");
        const stream = await getCameraStream();

        if (!isMounted) {
          return;
        }

        cameraStreamRef.current = stream;
        await assignStreamToVideo(stream);
        setIsCameraReady(true);

        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        const { poseLandmarker, delegate } =
          await createPoseLandmarkerWithFallback(vision);

        if (!isMounted) {
          poseLandmarker.close();
          return;
        }

        poseLandmarkerRef.current = poseLandmarker;
        setIsDetectorReady(true);
        setDetectorMode(delegate);

        const detectFrame = () => {
          const video = videoRef.current;
          const landmarker = poseLandmarkerRef.current;

          if (
            video &&
            landmarker &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            const result = landmarker.detectForVideo(video, performance.now());
            const poseLandmarks = result.landmarks?.[0];
            const payload = buildPosePayload(poseLandmarks);

            latestPayloadRef.current = payload;
            setIsPoseReady(Boolean(payload));
          }

          animationFrameRef.current = requestAnimationFrame(detectFrame);
        };

        animationFrameRef.current = requestAnimationFrame(detectFrame);

      } catch (error) {
        console.error("Camera initialization failed:", {
          name: error?.name,
          message: error?.message,
        });
        console.error("카메라 또는 포즈 감지 초기화 실패:", error);
        setDetectorError(
          error?.message || "카메라 또는 포즈 감지를 초기화하지 못했습니다."
        );
      }
    };

    setupCameraAndDetector();

    return () => {
      isMounted = false;
      console.debug("cleanup");

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }


      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close();
        poseLandmarkerRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }

      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isCameraReady) {
      return undefined;
    }

    let isMounted = true;

    aiFrameIntervalRef.current = window.setInterval(async () => {
      if (!isMounted || !cameraStreamRef.current || !videoRef.current) {
        return;
      }

      try {
        await sendCurrentAiFrameRef.current?.();
      } catch (error) {
        if (isMounted) {
          const baseMessage = error.message || "AI 프레임 분석에 실패했습니다.";
          if (isAiFramePausedRef.current) {
            console.warn(`${baseMessage} AI 자동 분석을 중지했습니다.`);
          }
        }
      }
    }, AI_FRAME_INTERVAL_MS);

    return () => {
      isMounted = false;

      if (aiFrameIntervalRef.current) {
        clearInterval(aiFrameIntervalRef.current);
        aiFrameIntervalRef.current = null;
      }
    };
  }, [isCameraReady]);

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        {status !== "normal" && (
          <div className={`posture-alert-banner ${status}`}>
            <strong>{statusText[status]}</strong>
            <span>{alertBannerMessage}</span>
          </div>
        )}

        <div className="dashboard-header">
          <img
            src="/images/NeckOn.png"
            className="dashboard-logo"
            alt="NeckOn 로고"
            onClick={() => navigate("/dashboardSummary")}
          />

          <div
            className="user-badge"
            onClick={() => navigate("/dashboardSummary")}
          >
            {displayName} 님
          </div>
        </div>

        <div className="dashboard-main">
          <div className={`webcam-box ${status}`}>
            <video
              ref={attachVideoRef}
              autoPlay
              playsInline
              muted
              className="webcam-video"
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>

          <div className="side-panel">
            <div className="status-mode-row">
              <div className="mode-box">
                <div className={currentMode === "FRONT" ? "mode-active" : ""}>
                  정면모드
                </div>
                <div className={currentMode === "SIDE_LEFT" ? "mode-active" : ""}>
                  측면모드(좌측)
                </div>
                <div className={currentMode === "SIDE_RIGHT" ? "mode-active" : ""}>
                  측면모드(우측)
                </div>
              </div>

              <div className={`status-box ${status}`}>
                {statusCardText}
              </div>
            </div>

            <div className="info-box">
              <p className="info-label">{firstMetricLabel}</p>
              <h1 className="info-value">{firstMetricValue}</h1>
            </div>

            <div className="info-box">
              <p className="info-label">{secondMetricLabel}</p>
              <h1 className="info-value">{secondMetricValue}</h1>
            </div>

            <div className="graph-box">
              <p className="graph-title">최근 1분 자세 로그</p>
              <div className="graph line-chart-card">
                {chartPoints.length > 0 ? (
                  <svg
                    className="posture-line-chart"
                    viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                    role="img"
                    aria-label="최근 1분 자세 로그 그래프"
                  >
                    <path
                      d={chartPath}
                      fill="none"
                      stroke="#8C9E6D"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {chartPoints.map((point) => (
                      <circle
                        key={point.id}
                        cx={point.x}
                        cy={point.y}
                        r="5"
                        fill={getGraphColorByStatus(point.status)}
                      />
                    ))}
                  </svg>
                ) : (
                  <div className="line-chart-empty">-</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-footer">
          <button
            className="btn-green"
            onClick={handleToggleAnalysis}
            disabled={isManualAnalyzing}
          >
            {isAnalysisPaused ? "다시 시작" : "일시정지"}
          </button>
          <button className="btn-green" onClick={handleSaveLandmark}>
            기준 자세 재설정
          </button>
          <button
            className="btn-outline"
            onClick={async () => {
              const nextSoundOn = !soundOn;

              if (nextSoundOn) {
                await ensureAudioContextReady();
                soundOnRef.current = true;
                await playAlertSound("warning");
              }

              setSoundOn(nextSoundOn);
            }}
          >
            {soundOn ? "알림 소리 끄기" : "알림 소리 켜기"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
