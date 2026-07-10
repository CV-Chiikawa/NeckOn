import base64
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import cv2
import mediapipe as mp
import numpy as np


DEFAULT_AI_CODE_PATH = (
    Path(__file__).resolve().parents[2]
    / ".."
    / "AIX_AI"
    / "posture_monitor_ai"
    / "Finally"
).resolve()
AI_CODE_PATH = Path(os.environ.get("AI_POSTURE_CODE_PATH", DEFAULT_AI_CODE_PATH)).resolve()

if not AI_CODE_PATH.exists():
    raise RuntimeError(f"AI posture code path does not exist: {AI_CODE_PATH}")

sys.path.insert(0, str(AI_CODE_PATH))

from mode_inference import ModeInferencer  # noqa: E402
from front_monitor import FrontMonitor  # noqa: E402
from side_monitor import SideMonitor  # noqa: E402


HOST = os.environ.get("AI_POSTURE_HOST", "127.0.0.1")
PORT = int(os.environ.get("AI_POSTURE_PORT", "8001"))
MAX_REQUEST_BYTES = int(os.environ.get("AI_POSTURE_MAX_REQUEST_BYTES", "2500000"))

mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
mp_face_detection = mp.solutions.face_detection

pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=1,
    smooth_landmarks=True,
    enable_segmentation=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)
face_detection = mp_face_detection.FaceDetection(
    model_selection=0,
    min_detection_confidence=0.5,
)

sessions = {}
process_lock = threading.Lock()


def decode_frame_data_url(frame_data_url):
    if not isinstance(frame_data_url, str) or "," not in frame_data_url:
        raise ValueError("frame_data_url must be a data URL.")

    _, encoded = frame_data_url.split(",", 1)
    frame_bytes = base64.b64decode(encoded)
    frame_array = np.frombuffer(frame_bytes, dtype=np.uint8)
    frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)

    if frame is None:
        raise ValueError("frame_data_url could not be decoded as an image.")

    return frame


def state_from_ui(ui):
    level_text = str(ui.get("level_text") or "").upper()

    if "BAD" in level_text:
        return "BAD"
    if "CAUTION" in level_text:
        return "CAUTION"
    if "GOOD" in level_text:
        return "GOOD"

    return "GUIDE"


def normalize_mode(mode):
    if mode in ("FRONT", "SIDE_LEFT", "SIDE_RIGHT"):
        return mode

    return "PENDING"


class PostureSession:
    def __init__(self):
        self.inferencer = ModeInferencer(mp_pose, mp_face_detection)
        self.active_monitor = None
        self.phase = "infer"
        self.locked_mode = None

    def reset(self):
        self.__init__()

    def process_frame(self, frame):
        now = time.time()
        frame_work = frame.copy()
        rgb = cv2.cvtColor(frame_work, cv2.COLOR_BGR2RGB)

        with process_lock:
            result = pose.process(rgb)
            face_result = face_detection.process(rgb)

        landmarks = result.pose_landmarks.landmark if result.pose_landmarks else None

        if landmarks is None:
            return {
                "mode": normalize_mode(self.locked_mode),
                "state": "GUIDE",
                "message": "Pose not detected",
                "show_bad_alert": False,
                "debug": {
                    "phase": self.phase,
                    "reason": "no_pose",
                },
            }

        if self.phase == "infer":
            infer = self.inferencer.update(landmarks, face_result, now)
            self.locked_mode = infer.get("locked_mode")

            if self.locked_mode == "FRONT":
                self.active_monitor = FrontMonitor(mp_pose, mp_drawing)
                self.phase = "monitor"
            elif self.locked_mode == "SIDE_LEFT":
                self.active_monitor = SideMonitor(mp_pose, mp_face_detection, "LEFT")
                self.phase = "monitor"
            elif self.locked_mode == "SIDE_RIGHT":
                self.active_monitor = SideMonitor(mp_pose, mp_face_detection, "RIGHT")
                self.phase = "monitor"

            return {
                "mode": normalize_mode(self.locked_mode or infer.get("preview_mode")),
                "state": "GUIDE",
                "message": "Detecting camera view",
                "show_bad_alert": False,
                "debug": {
                    "phase": "infer",
                    **infer,
                },
            }

        ui = self.active_monitor.update(frame_work, landmarks, face_result, now)
        state = state_from_ui(ui)

        return {
            "mode": normalize_mode(self.locked_mode),
            "state": state,
            "message": ui.get("header_text") or "",
            "show_bad_alert": bool(ui.get("show_bad_alert")),
            "score_text": ui.get("score_text"),
            "info_lines": ui.get("info_lines", []),
            "debug": {
                "phase": self.phase,
                "level_text": ui.get("level_text"),
            },
        }


def get_session(session_id):
    if session_id not in sessions:
        sessions[session_id] = PostureSession()

    return sessions[session_id]


class Handler(BaseHTTPRequestHandler):
    def _read_json(self):
        content_length = int(self.headers.get("Content-Length", "0"))

        if content_length <= 0:
            return {}
        if content_length > MAX_REQUEST_BYTES:
            raise ValueError("Request body is too large.")

        raw_body = self.rfile.read(content_length)
        return json.loads(raw_body.decode("utf-8"))

    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/health":
            self._send_json(200, {"status": "ok", "sessions": len(sessions)})
            return

        self._send_json(404, {"message": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path

        try:
            payload = self._read_json()
            session_id = str(payload.get("session_id") or "default")

            if path == "/reset-session":
                sessions.pop(session_id, None)
                self._send_json(200, {"session_id": session_id, "reset": True})
                return

            if path == "/process-frame":
                frame = decode_frame_data_url(payload.get("frame_data_url"))
                result = get_session(session_id).process_frame(frame)
                self._send_json(200, {"session_id": session_id, **result})
                return

            self._send_json(404, {"message": "Not found"})
        except Exception as error:
            self._send_json(400, {"message": str(error)})

    def log_message(self, format, *args):
        return


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"AI posture server listening on http://{HOST}:{PORT}")
    print(f"Using AI code from {AI_CODE_PATH}")

    try:
        server.serve_forever()
    finally:
        pose.close()
        face_detection.close()


if __name__ == "__main__":
    main()
