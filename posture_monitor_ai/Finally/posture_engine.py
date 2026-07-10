import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import cv2
import mediapipe as mp

# 원본 AI 코드 폴더를 import 경로에 추가
BASE_DIR = Path(__file__).resolve().parent.parent / "Finally"
sys.path.insert(0, str(BASE_DIR))

from config import DISPLAY_MIRRORED  # noqa: E402
from mode_inference import ModeInferencer  # noqa: E402
from front_monitor import FrontMonitor  # noqa: E402
from side_monitor import SideMonitor  # noqa: E402


def to_display_mode(mode_name: Optional[str], display_mirrored: bool = True) -> str:
    if mode_name is None:
        return "pending"
    if mode_name == "FRONT":
        return "FRONT"
    if mode_name == "SIDE_LEFT":
        return "SIDE_RIGHT" if display_mirrored else "SIDE_LEFT"
    if mode_name == "SIDE_RIGHT":
        return "SIDE_LEFT" if display_mirrored else "SIDE_RIGHT"
    return mode_name


def parse_level(level_text: str) -> str:
    if not level_text:
        return "UNKNOWN"
    return level_text.replace("LEVEL:", "").strip()


def parse_score(score_text: str) -> Optional[float]:
    if not score_text:
        return None
    raw = score_text.replace("Score:", "").strip()
    if raw in {"", "-"}:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


@dataclass
class EngineResult:
    session_id: str
    phase: str
    mode: str
    locked_mode: Optional[str]
    preview_mode: Optional[str]
    state: str
    score: Optional[float]
    message: Optional[str]
    show_bad_alert: bool
    info_lines: list[str]
    debug: dict[str, Any]


class PostureEngine:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.last_seen = time.time()

        self.mp_pose = mp.solutions.pose
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_face_detection = mp.solutions.face_detection

        self.pose = self.mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            smooth_landmarks=True,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        self.face_detection = self.mp_face_detection.FaceDetection(
            model_selection=0,
            min_detection_confidence=0.5,
        )

        self.inferencer = ModeInferencer(self.mp_pose, self.mp_face_detection)
        self.active_monitor = None
        self.phase = "infer"
        self.locked_mode = None

    def reset_session(self):
        self.inferencer.reset()
        self.active_monitor = None
        self.phase = "infer"
        self.locked_mode = None
        self.last_seen = time.time()

    def close(self):
        try:
            self.pose.close()
        except Exception:
            pass
        try:
            self.face_detection.close()
        except Exception:
            pass

    def _infer_ui(self, infer: Optional[dict], has_landmarks: bool) -> dict[str, Any]:
        if not has_landmarks:
            return {
                "header_text": "DETECTING VIEW",
                "header_color": (255, 255, 255),
                "level_text": "LEVEL: GUIDE",
                "score_text": "Score: -",
                "info_lines": [
                    "ActiveMode: pending",
                    "ModeLock: pending",
                    "Show your face/body to the camera",
                    "OverlayMode: pending",
                    "Waiting for pose...",
                ],
                "show_bad_alert": False,
            }

        return {
            "header_text": "DETECTING VIEW",
            "header_color": (255, 255, 255),
            "level_text": "LEVEL: GUIDE",
            "score_text": "Score: -",
            "info_lines": [
                f"ActiveMode: {to_display_mode(infer.get('locked_mode'), DISPLAY_MIRRORED)}",
                f"PreviewMode: {to_display_mode(infer.get('preview_mode'), DISPLAY_MIRRORED)}",
                f"FrontConf: {infer.get('front_conf', 0.0):.3f}",
                f"LeftSideConf: {infer.get('left_conf', 0.0):.3f}",
                f"RightSideConf: {infer.get('right_conf', 0.0):.3f}",
            ],
            "show_bad_alert": False,
        }

    def process_frame(self, frame_bgr) -> EngineResult:
        self.last_seen = time.time()

        if frame_bgr is None:
            raise ValueError("frame_bgr is None")
        if len(frame_bgr.shape) != 3 or frame_bgr.shape[2] != 3:
            raise ValueError("frame_bgr must be BGR image")

        now = time.time()
        frame_draw = frame_bgr.copy()

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        pose_result = self.pose.process(rgb)
        face_result = self.face_detection.process(rgb)

        landmarks = pose_result.pose_landmarks.landmark if pose_result.pose_landmarks else None
        infer = None

        if self.phase == "infer":
            if landmarks is not None:
                infer = self.inferencer.update(landmarks, face_result, now)
                if infer.get("locked_mode") is not None:
                    self.locked_mode = infer["locked_mode"]
                    if self.locked_mode == "FRONT":
                        self.active_monitor = FrontMonitor(self.mp_pose, self.mp_drawing)
                    elif self.locked_mode == "SIDE_LEFT":
                        self.active_monitor = SideMonitor(self.mp_pose, self.mp_face_detection, "LEFT")
                    else:
                        self.active_monitor = SideMonitor(self.mp_pose, self.mp_face_detection, "RIGHT")
                    self.phase = "monitor"

            ui = self._infer_ui(infer, landmarks is not None)
        else:
            if self.active_monitor is None:
                self.reset_session()
                ui = self._infer_ui(None, False)
            else:
                ui = self.active_monitor.update(frame_draw, landmarks, face_result, now)

        state = parse_level(ui.get("level_text", "LEVEL: UNKNOWN"))
        score = parse_score(ui.get("score_text", "Score: -"))
        info_lines = ui.get("info_lines", [])
        message = info_lines[0] if info_lines else None

        return EngineResult(
            session_id=self.session_id,
            phase=self.phase,
            mode=to_display_mode(self.locked_mode, DISPLAY_MIRRORED) if self.locked_mode else "pending",
            locked_mode=self.locked_mode,
            preview_mode=infer.get("preview_mode") if infer else None,
            state=state,
            score=score,
            message=message,
            show_bad_alert=bool(ui.get("show_bad_alert", False)),
            info_lines=info_lines,
            debug={
                "has_landmarks": landmarks is not None,
                "phase": self.phase,
                "locked_mode": self.locked_mode,
            },
        )