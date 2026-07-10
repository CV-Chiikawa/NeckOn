
import time
from collections import deque

import cv2
import numpy as np

from config import (
    FRONT_BASELINE_SECONDS, FRONT_SMOOTHING_WINDOW,
    HEAD_TILT_THRESHOLD, SHOULDER_TILT_THRESHOLD, CENTER_OFFSET_THRESHOLD,
    NOSE_FORWARD_Z_THRESHOLD, EAR_FORWARD_Z_THRESHOLD, NOSE_DROP_THRESHOLD,
    FACE_SHOULDER_RATIO_THRESHOLD, TOO_CLOSE_RATIO, TOO_FAR_RATIO,
    MAX_HEAD_TILT_FOR_SCORING, MAX_CENTER_OFFSET_FOR_SCORING,
    FRONT_CAUTION_SCORE, FRONT_BAD_SCORE,
    FRONT_CAUTION_ENTER_FRAMES, FRONT_BAD_ENTER_FRAMES, FRONT_GOOD_RETURN_FRAMES,
    BAD_ALERT_SECONDS,
)
from common_utils import (
    get_lm, midpoint, mean_last, norm_score, put_text, draw_front_overlay
)


class FrontMonitor:
    def __init__(self, mp_pose, mp_drawing):
        self.mp_pose = mp_pose
        self.mp_drawing = mp_drawing
        self.reset_for_baseline()

    def reset_for_baseline(self):
        self.mode = "baseline"
        self.baseline_start_time = time.time()

        self.baseline_buffer = {
            "head_tilt": [],
            "shoulder_tilt": [],
            "center_offset": [],
            "nose_z": [],
            "ear_z": [],
            "nose_y": [],
            "face_width": [],
            "shoulder_width": [],
            "face_shoulder_ratio": [],
        }

        self.baseline = {}

        self.history = {
            "head_tilt": deque(maxlen=30),
            "shoulder_tilt": deque(maxlen=30),
            "center_offset": deque(maxlen=30),
            "nose_z": deque(maxlen=30),
            "ear_z": deque(maxlen=30),
            "nose_y": deque(maxlen=30),
            "face_width": deque(maxlen=30),
            "shoulder_width": deque(maxlen=30),
            "face_shoulder_ratio": deque(maxlen=30),
            "raw_score": deque(maxlen=15),
        }

        self.state = "GOOD"
        self.bad_since = None
        self.caution_enter_count = 0
        self.bad_enter_count = 0
        self.good_return_count = 0

    def _build_ui(self, header_text, header_color, level_text, score_text, info_lines, show_bad_alert=False):
        return {
            "header_text": header_text,
            "header_color": header_color,
            "level_text": level_text,
            "score_text": score_text,
            "info_lines": info_lines,
            "show_bad_alert": show_bad_alert,
        }

    def update(self, frame, landmarks, face_result=None, now=None):
        now = time.time() if now is None else now

        if landmarks is None:
            return self._build_ui(
                "NO POSE", (255, 255, 255), "LEVEL: GUIDE", "Score: -", ["Pose not detected"], False
            )

        h, w, _ = frame.shape

        nose = get_lm(landmarks, self.mp_pose.PoseLandmark.NOSE.value)
        left_ear = get_lm(landmarks, self.mp_pose.PoseLandmark.LEFT_EAR.value)
        right_ear = get_lm(landmarks, self.mp_pose.PoseLandmark.RIGHT_EAR.value)
        left_shoulder = get_lm(landmarks, self.mp_pose.PoseLandmark.LEFT_SHOULDER.value)
        right_shoulder = get_lm(landmarks, self.mp_pose.PoseLandmark.RIGHT_SHOULDER.value)
        mouth_left = get_lm(landmarks, self.mp_pose.PoseLandmark.MOUTH_LEFT.value)
        mouth_right = get_lm(landmarks, self.mp_pose.PoseLandmark.MOUTH_RIGHT.value)

        ear_center = midpoint(left_ear, right_ear)
        shoulder_center = midpoint(left_shoulder, right_shoulder)
        mouth_center = midpoint(mouth_left, mouth_right)

        head_tilt = left_ear["y"] - right_ear["y"]
        shoulder_tilt = left_shoulder["y"] - right_shoulder["y"]
        center_offset = nose["x"] - shoulder_center["x"]

        ear_avg_z = (left_ear["z"] + right_ear["z"]) / 2.0
        nose_z = nose["z"]
        nose_y = nose["y"]

        face_width = abs(left_ear["x"] - right_ear["x"])
        shoulder_width = abs(left_shoulder["x"] - right_shoulder["x"])
        face_shoulder_ratio = face_width / (shoulder_width + 1e-6)

        self.history["head_tilt"].append(head_tilt)
        self.history["shoulder_tilt"].append(shoulder_tilt)
        self.history["center_offset"].append(center_offset)
        self.history["nose_z"].append(nose_z)
        self.history["ear_z"].append(ear_avg_z)
        self.history["nose_y"].append(nose_y)
        self.history["face_width"].append(face_width)
        self.history["shoulder_width"].append(shoulder_width)
        self.history["face_shoulder_ratio"].append(face_shoulder_ratio)

        s_head_tilt = mean_last(self.history["head_tilt"], FRONT_SMOOTHING_WINDOW)
        s_shoulder_tilt = mean_last(self.history["shoulder_tilt"], FRONT_SMOOTHING_WINDOW)
        s_center_offset = mean_last(self.history["center_offset"], FRONT_SMOOTHING_WINDOW)
        s_nose_z = mean_last(self.history["nose_z"], FRONT_SMOOTHING_WINDOW)
        s_ear_z = mean_last(self.history["ear_z"], FRONT_SMOOTHING_WINDOW)
        s_nose_y = mean_last(self.history["nose_y"], FRONT_SMOOTHING_WINDOW)
        s_face_width = mean_last(self.history["face_width"], FRONT_SMOOTHING_WINDOW)
        s_shoulder_width = mean_last(self.history["shoulder_width"], FRONT_SMOOTHING_WINDOW)
        s_face_shoulder_ratio = mean_last(self.history["face_shoulder_ratio"], FRONT_SMOOTHING_WINDOW)

        # Drawing: front mode uses full pose landmarks
        draw_front_overlay(frame, landmarks, self.mp_pose, self.mp_drawing)

        if self.mode == "baseline":
            elapsed = now - self.baseline_start_time

            self.baseline_buffer["head_tilt"].append(s_head_tilt)
            self.baseline_buffer["shoulder_tilt"].append(s_shoulder_tilt)
            self.baseline_buffer["center_offset"].append(s_center_offset)
            self.baseline_buffer["nose_z"].append(s_nose_z)
            self.baseline_buffer["ear_z"].append(s_ear_z)
            self.baseline_buffer["nose_y"].append(s_nose_y)
            self.baseline_buffer["face_width"].append(s_face_width)
            self.baseline_buffer["shoulder_width"].append(s_shoulder_width)
            self.baseline_buffer["face_shoulder_ratio"].append(s_face_shoulder_ratio)

            if elapsed >= FRONT_BASELINE_SECONDS:
                self.baseline = {k: float(np.mean(v)) for k, v in self.baseline_buffer.items()}
                self.mode = "monitor"
                self.state = "GOOD"
                self.bad_since = None
                self.caution_enter_count = 0
                self.bad_enter_count = 0
                self.good_return_count = 0

            return self._build_ui(
                f"Saving front baseline... {max(0, int(FRONT_BASELINE_SECONDS - elapsed) + 1)}s",
                (255, 255, 255),
                "LEVEL: GUIDE",
                "Score: 0 / Avg: 0.0",
                [
                    "Keep a natural front posture",
                    "OverlayMode: FRONT_FULL",
                    "Look at the monitor naturally",
                ],
                False
            )

        d_head_tilt = abs(s_head_tilt - self.baseline["head_tilt"])
        d_shoulder_tilt = abs(s_shoulder_tilt - self.baseline["shoulder_tilt"])
        d_center_offset = abs(s_center_offset - self.baseline["center_offset"])

        d_nose_forward = self.baseline["nose_z"] - s_nose_z
        d_ear_forward = self.baseline["ear_z"] - s_ear_z
        d_nose_drop = s_nose_y - self.baseline["nose_y"]
        d_face_shoulder_ratio = s_face_shoulder_ratio - self.baseline["face_shoulder_ratio"]

        distance_ratio = s_face_width / (self.baseline["face_width"] + 1e-6)
        too_close = distance_ratio > TOO_CLOSE_RATIO
        too_far = distance_ratio < TOO_FAR_RATIO

        out_of_scope = (
            d_head_tilt > MAX_HEAD_TILT_FOR_SCORING
            or d_center_offset > MAX_CENTER_OFFSET_FOR_SCORING
            or (d_head_tilt > 0.070 and d_center_offset > 0.060)
        )

        raw_score = 0
        reasons = []
        guidance_text = None
        guidance_color = (255, 255, 255)

        if too_close:
            guidance_text = "MOVE BACK"
            guidance_color = (0, 255, 255)
            reasons.append("too close")
            raw_score = 0

        elif too_far:
            guidance_text = "MOVE CLOSER"
            guidance_color = (0, 255, 255)
            reasons.append("too far")
            raw_score = 0

        elif out_of_scope:
            guidance_text = "FACE FRONT"
            guidance_color = (0, 255, 255)
            reasons.append("out of range")
            raw_score = 0

        else:
            forward_score = (
                1.15 * norm_score(d_nose_forward, NOSE_FORWARD_Z_THRESHOLD) +
                0.90 * norm_score(d_ear_forward, EAR_FORWARD_Z_THRESHOLD) +
                1.00 * norm_score(d_nose_drop, NOSE_DROP_THRESHOLD) +
                0.75 * norm_score(d_face_shoulder_ratio, FACE_SHOULDER_RATIO_THRESHOLD)
            )

            imbalance_score = (
                0.90 * norm_score(d_head_tilt, HEAD_TILT_THRESHOLD) +
                0.65 * norm_score(d_center_offset, CENTER_OFFSET_THRESHOLD) +
                0.45 * norm_score(d_shoulder_tilt, SHOULDER_TILT_THRESHOLD)
            )

            if d_nose_forward > NOSE_FORWARD_Z_THRESHOLD:
                reasons.append("nose forward")
            if d_ear_forward > EAR_FORWARD_Z_THRESHOLD:
                reasons.append("ear forward")
            if d_nose_drop > NOSE_DROP_THRESHOLD:
                reasons.append("chin down")
            if d_face_shoulder_ratio > FACE_SHOULDER_RATIO_THRESHOLD:
                reasons.append("face closer")
            if d_head_tilt > HEAD_TILT_THRESHOLD:
                reasons.append("head tilt")
            if d_center_offset > CENTER_OFFSET_THRESHOLD:
                reasons.append("center offset")
            if d_shoulder_tilt > SHOULDER_TILT_THRESHOLD:
                reasons.append("shoulder tilt")

            if forward_score < 1.15 and imbalance_score < 1.05:
                raw_score = 0
            elif forward_score >= 2.55 or (forward_score >= 2.05 and imbalance_score >= 1.15):
                raw_score = FRONT_BAD_SCORE
            elif forward_score >= 1.20 or imbalance_score >= 1.10:
                raw_score = FRONT_CAUTION_SCORE
            else:
                raw_score = 0

        self.history["raw_score"].append(raw_score)
        avg_score = round(mean_last(self.history["raw_score"], 5), 2)

        if raw_score >= FRONT_BAD_SCORE:
            self.bad_enter_count += 1
            self.caution_enter_count += 1
            self.good_return_count = 0
        elif raw_score >= FRONT_CAUTION_SCORE:
            self.caution_enter_count += 1
            self.bad_enter_count = 0
            self.good_return_count = 0
        else:
            self.good_return_count += 1
            self.caution_enter_count = 0
            self.bad_enter_count = 0

        prev_state = self.state

        if self.state == "GOOD":
            if self.bad_enter_count >= FRONT_BAD_ENTER_FRAMES:
                self.state = "BAD"
            elif self.caution_enter_count >= FRONT_CAUTION_ENTER_FRAMES:
                self.state = "CAUTION"

        elif self.state == "CAUTION":
            if self.bad_enter_count >= FRONT_BAD_ENTER_FRAMES:
                self.state = "BAD"
            elif self.good_return_count >= FRONT_GOOD_RETURN_FRAMES:
                self.state = "GOOD"

        elif self.state == "BAD":
            if self.good_return_count >= FRONT_GOOD_RETURN_FRAMES:
                self.state = "GOOD"
            elif self.caution_enter_count >= FRONT_CAUTION_ENTER_FRAMES and raw_score < FRONT_BAD_SCORE:
                self.state = "CAUTION"

        if self.state != prev_state:
            if self.state == "BAD":
                self.bad_since = now
            elif self.state != "BAD":
                self.bad_since = None

        bad_sustain = 0.0
        alert = False
        if self.state == "BAD" and self.bad_since is not None:
            bad_sustain = now - self.bad_since
            if bad_sustain >= BAD_ALERT_SECONDS:
                alert = True

        if guidance_text is not None:
            header_text = guidance_text
            header_color = guidance_color
        else:
            if self.state == "GOOD":
                header_text = "Good posture"
                header_color = (0, 255, 0)
            elif self.state == "CAUTION":
                header_text = "Caution posture"
                header_color = (0, 255, 255)
            else:
                header_text = "Bad posture risk"
                header_color = (0, 0, 255)

        info_lines = [
            "ActiveMode: FRONT",
            "LockState: FRONT",
            "OverlayMode: FRONT_FULL",
            f"HeadTilt: {d_head_tilt:.4f}",
            f"ShoulderTilt: {d_shoulder_tilt:.4f}",
            f"CenterOffset: {d_center_offset:.4f}",
            f"NoseForwardZ: {d_nose_forward:.4f}",
            f"EarForwardZ: {d_ear_forward:.4f}",
            f"NoseDrop: {d_nose_drop:.4f}",
            f"FaceShoulderRatio: {d_face_shoulder_ratio:.4f}",
            f"DistanceRatio: {distance_ratio:.3f}",
            f"Reasons: {', '.join(reasons) if reasons else 'stable'}",
            f"BAD Sustain: {bad_sustain:.1f}s",
        ]

        return self._build_ui(
            header_text,
            header_color,
            f"LEVEL: {self.state}",
            f"Score: {raw_score} / Avg: {avg_score}",
            info_lines,
            alert
        )
