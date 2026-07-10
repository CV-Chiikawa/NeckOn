import time
from collections import deque
import cv2
from config import (
    SIDE_BASELINE_SECONDS, POST_BASELINE_GRACE, SIDE_SMOOTHING_WINDOW,
    SIDE_RAW_SCORE_AVG_WINDOW, LANDMARK_SMOOTH_WINDOW, MIN_VISIBILITY,
    SIDE_CAUTION_SCORE, SIDE_BAD_SCORE,
    SIDE_CAUTION_ENTER_FRAMES, SIDE_BAD_ENTER_FRAMES, SIDE_GOOD_RETURN_FRAMES,
    SIDE_BAD_TO_CAUTION_FRAMES, SIDE_BAD_ALERT_SECONDS,
    VIEW_QUALITY_OK_MIN, OPPOSITE_VIEW_QUALITY_MARGIN,
    EXTREME_TOO_SIDE_YAW, EXTREME_TOO_SIDE_PROFILE,
    MIN_SCALE_RATIO, MAX_SCALE_RATIO, EXTREME_ABS_CVA_BAD,
    DELTA_CVA_CAUTION_1, DELTA_CVA_CAUTION_2,
    NOSE_FORWARD_CAUTION_1, NOSE_FORWARD_BAD_1, EAR_FORWARD_BAD_1,
    CHIN_DROP_CAUTION_1, CHIN_DROP_BAD_1,
    UNMEASURABLE_NOSE_DROP, UNMEASURABLE_NOSE_FORWARD_MAX,
)
from common_utils import (
    put_text, mean_last, median_or_none, clamp,
    get_side_points, get_face_scale,
    calculate_cva, calc_view_quality, user_side_label, draw_side_three_point_overlay,
)

class SideMonitor:
    def __init__(self, mp_pose, mp_face_detection, locked_side):
        self.mp_pose = mp_pose
        self.mp_face_detection = mp_face_detection
        self.locked_side = locked_side
        self.reset_for_baseline()

    def make_metric_buffer(self):
        return {
            "cva": [],
            "ear_forward": [],
            "nose_forward": [],
            "nose_y": [],
            "side_profile": [],
            "shoulder_y": [],
            "side_score": [],
            "view_quality": [],
            "face_scale": [],
        }

    def make_history(self):
        return {
            "cva": deque(maxlen=30),
            "ear_forward": deque(maxlen=30),
            "nose_forward": deque(maxlen=30),
            "nose_y": deque(maxlen=30),
            "side_profile": deque(maxlen=30),
            "shoulder_y": deque(maxlen=30),
            "face_scale": deque(maxlen=30),
            "raw_score": deque(maxlen=30),
        }

    def make_point_history(self):
        return {
            "LEFT": {
                "nose_x": deque(maxlen=15),
                "nose_y": deque(maxlen=15),
                "ear_x": deque(maxlen=15),
                "ear_y": deque(maxlen=15),
                "shoulder_x": deque(maxlen=15),
                "shoulder_y": deque(maxlen=15),
            },
            "RIGHT": {
                "nose_x": deque(maxlen=15),
                "nose_y": deque(maxlen=15),
                "ear_x": deque(maxlen=15),
                "ear_y": deque(maxlen=15),
                "shoulder_x": deque(maxlen=15),
                "shoulder_y": deque(maxlen=15),
            },
        }

    def clear_point_history(self, side_name):
        for k in self.point_history[side_name]:
            self.point_history[side_name][k].clear()

    def smooth_point(self, point_history, prefix, point, window):
        point_history[f"{prefix}_x"].append(point["x"])
        point_history[f"{prefix}_y"].append(point["y"])

        sx = mean_last(point_history[f"{prefix}_x"], window)
        sy = mean_last(point_history[f"{prefix}_y"], window)

        return {
            "x": point["x"] if sx is None else sx,
            "y": point["y"] if sy is None else sy,
            "z": point["z"],
            "vis": point["vis"],
        }

    def get_smoothed_side_points(self, landmarks, side_name, face_result=None):
        nose, ear, shoulder = get_side_points(
            landmarks, self.mp_pose, side_name, face_result, self.mp_face_detection
        )

        hist = self.point_history[side_name]
        nose = self.smooth_point(hist, "nose", nose, LANDMARK_SMOOTH_WINDOW)
        ear = self.smooth_point(hist, "ear", ear, LANDMARK_SMOOTH_WINDOW)
        shoulder = self.smooth_point(hist, "shoulder", shoulder, LANDMARK_SMOOTH_WINDOW)
        return nose, ear, shoulder

    def calc_side_pack(self, landmarks, side_name, face_result=None):
        nose, ear, shoulder = self.get_smoothed_side_points(landmarks, side_name, face_result)

        visible_ok = (ear["vis"] >= MIN_VISIBILITY and shoulder["vis"] >= MIN_VISIBILITY)
        if not visible_ok:
            return None

        face_scale = get_face_scale(landmarks, self.mp_pose, face_result)

        cva = calculate_cva(ear, shoulder)
        ear_forward = abs(ear["x"] - shoulder["x"])
        nose_forward = abs(nose["x"] - shoulder["x"])
        nose_y = nose["y"]
        side_profile = abs(nose["x"] - ear["x"])
        shoulder_y = shoulder["y"]

        view_quality, yaw_proxy, view_state = calc_view_quality(
            landmarks, self.mp_pose, side_name, side_profile, face_result, self.mp_face_detection
        )

        side_score = (
            0.90 * (ear["vis"] + shoulder["vis"]) +
            0.45 * nose_forward +
            0.25 * side_profile +
            0.90 * view_quality
        )

        return {
            "side": side_name,
            "nose": nose,
            "ear": ear,
            "shoulder": shoulder,
            "cva": cva,
            "ear_forward": ear_forward,
            "nose_forward": nose_forward,
            "nose_y": nose_y,
            "side_profile": side_profile,
            "shoulder_y": shoulder_y,
            "side_score": side_score,
            "view_quality": view_quality,
            "yaw_proxy": yaw_proxy,
            "view_state": view_state,
            "face_scale": face_scale,
        }

    def draw_side_overlay(self, frame, pack):
        if pack is None:
            return

        h, w, _ = frame.shape
        nose = pack["nose"]
        ear = pack["ear"]
        shoulder = pack["shoulder"]

        nose_pt = (int(nose["x"] * w), int(nose["y"] * h))
        ear_pt = (int(ear["x"] * w), int(ear["y"] * h))
        shoulder_pt = (int(shoulder["x"] * w), int(shoulder["y"] * h))

        cv2.circle(frame, nose_pt, 6, (0, 255, 0), -1)
        cv2.circle(frame, ear_pt, 6, (255, 255, 0), -1)
        cv2.circle(frame, shoulder_pt, 6, (255, 0, 0), -1)
        cv2.line(frame, ear_pt, shoulder_pt, (0, 255, 255), 2)

        horizontal_end = (int((shoulder["x"] + 0.18) * w), shoulder_pt[1])
        cv2.line(frame, shoulder_pt, horizontal_end, (220, 220, 220), 2)

    def classify_score(self, s_cva, delta_cva, delta_ear_forward, delta_nose_forward, delta_nose_drop):
        score = 0
        reasons = []

        cva_hit = False
        nose_hit = False
        chin_hit = False

        if delta_cva >= DELTA_CVA_CAUTION_1:
            score += 1
            cva_hit = True
            reasons.append("cva changed")
        if delta_cva >= DELTA_CVA_CAUTION_2:
            score += 1

        if delta_nose_forward >= NOSE_FORWARD_CAUTION_1:
            score += 1
            nose_hit = True
            reasons.append("nose forward")
        if delta_nose_forward >= NOSE_FORWARD_BAD_1:
            score += 1

        if delta_ear_forward >= EAR_FORWARD_BAD_1:
            score += 1
            reasons.append("ear forward")

        if delta_nose_drop >= CHIN_DROP_CAUTION_1:
            score += 1
            chin_hit = True
            reasons.append("chin down")
        if delta_nose_drop >= CHIN_DROP_BAD_1:
            score += 1

        if s_cva <= EXTREME_ABS_CVA_BAD:
            score += 1
            reasons.append("very low cva")

        combo_count = int(cva_hit) + int(nose_hit) + int(chin_hit)
        if combo_count >= 2:
            score += 1
            reasons.append("combined forward head")

        return score, reasons

    def reset_for_baseline(self):
        self.mode = "baseline"
        self.baseline_start_time = time.time()
        self.monitor_start_time = None

        self.baseline_buffer = self.make_metric_buffer()
        self.baseline = None
        self.point_history = self.make_point_history()
        self.history = self.make_history()

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

        current_pack = self.calc_side_pack(landmarks, self.locked_side, face_result)
        opposite_side = "RIGHT" if self.locked_side == "LEFT" else "LEFT"
        opposite_pack = self.calc_side_pack(landmarks, opposite_side, face_result)

        preview_pack = current_pack if current_pack is not None else opposite_pack
        if preview_pack is not None:
            self.draw_side_overlay(frame, preview_pack)

        locked_display = user_side_label(self.locked_side)
        active_mode_text = f"SIDE_{locked_display}"

        if self.mode == "baseline":
            elapsed = now - self.baseline_start_time

            if current_pack is not None and current_pack["view_state"] == "OK":
                for k in self.baseline_buffer:
                    self.baseline_buffer[k].append(current_pack[k])

            if elapsed >= SIDE_BASELINE_SECONDS:
                q = median_or_none(self.baseline_buffer["view_quality"])
                if q is None or q < VIEW_QUALITY_OK_MIN:
                    self.baseline_start_time = now
                    self.baseline_buffer = self.make_metric_buffer()
                    self.clear_point_history("LEFT")
                    self.clear_point_history("RIGHT")
                else:
                    self.baseline = {}
                    for k in [
                        "cva", "ear_forward", "nose_forward", "nose_y",
                        "side_profile", "shoulder_y", "face_scale"
                    ]:
                        self.baseline[k] = median_or_none(self.baseline_buffer[k])

                    self.mode = "monitor"
                    self.monitor_start_time = now

            return self._build_ui(
                f"Saving side baseline... {max(0, int(SIDE_BASELINE_SECONDS - elapsed) + 1)}s",
                (255, 255, 255),
                "LEVEL: GUIDE",
                "Score: 0 / Avg: 0.0",
                [
                    f"ActiveMode: {active_mode_text}",
                    "OverlayMode: SIDE_3POINT",
                    "Keep a natural oblique side posture",
                    "Recommended camera angle: about 40~65 deg",
                ],
                False
            )

        # monitor mode
        guide_mode = False
        raw_score = 0
        avg_score = 0.0
        bad_sustain = 0.0
        reasons = []

        if current_pack is None:
            self.clear_point_history(self.locked_side)
            self.bad_since = None
            self.state = "GOOD"
            self.caution_enter_count = 0
            self.bad_enter_count = 0
            self.good_return_count = 0

            return self._build_ui(
                "ADJUST CAMERA",
                (0, 255, 255),
                "LEVEL: GUIDE",
                "Score: 0 / Avg: 0.0",
                [
                    f"ActiveMode: {active_mode_text}",
                    "OverlayMode: SIDE_3POINT",
                    "Current side not visible enough",
                ],
                False
            )

        self.history["cva"].append(current_pack["cva"])
        self.history["ear_forward"].append(current_pack["ear_forward"])
        self.history["nose_forward"].append(current_pack["nose_forward"])
        self.history["nose_y"].append(current_pack["nose_y"])
        self.history["side_profile"].append(current_pack["side_profile"])
        self.history["shoulder_y"].append(current_pack["shoulder_y"])
        self.history["face_scale"].append(current_pack["face_scale"])

        s_cva = mean_last(self.history["cva"], SIDE_SMOOTHING_WINDOW)
        s_ear_forward_raw = mean_last(self.history["ear_forward"], SIDE_SMOOTHING_WINDOW)
        s_nose_forward_raw = mean_last(self.history["nose_forward"], SIDE_SMOOTHING_WINDOW)
        s_nose_y = mean_last(self.history["nose_y"], SIDE_SMOOTHING_WINDOW)
        s_side_profile_raw = mean_last(self.history["side_profile"], SIDE_SMOOTHING_WINDOW)
        s_shoulder_y = mean_last(self.history["shoulder_y"], SIDE_SMOOTHING_WINDOW)
        s_face_scale = mean_last(self.history["face_scale"], SIDE_SMOOTHING_WINDOW)

        base_scale = self.baseline["face_scale"]
        if base_scale is None or base_scale <= 1e-6 or s_face_scale is None:
            scale_ratio = 1.0
        else:
            scale_ratio = s_face_scale / base_scale
            scale_ratio = clamp(scale_ratio, MIN_SCALE_RATIO, MAX_SCALE_RATIO)

        s_ear_forward = s_ear_forward_raw / scale_ratio
        s_nose_forward = s_nose_forward_raw / scale_ratio
        s_side_profile = s_side_profile_raw / scale_ratio

        delta_cva = self.baseline["cva"] - s_cva
        delta_ear_forward = s_ear_forward - self.baseline["ear_forward"]
        delta_nose_forward = s_nose_forward - self.baseline["nose_forward"]
        delta_nose_drop = (s_nose_y - self.baseline["nose_y"]) / scale_ratio
        shoulder_shift = abs(s_shoulder_y - self.baseline["shoulder_y"])

        in_grace = (now - self.monitor_start_time) < POST_BASELINE_GRACE

        view_quality, signed_yaw, view_state = calc_view_quality(
            landmarks, self.mp_pose, self.locked_side, s_side_profile, face_result, self.mp_face_detection
        )

        if view_state == "TOO_FRONT":
            guide_mode = True
            header_text = "TURN A BIT SIDE"
            header_color = (0, 255, 255)
            reasons = ["camera too frontal"]

        elif view_state == "WRONG_SIDE":
            guide_mode = True
            header_text = "SHOW OTHER SIDE"
            header_color = (0, 255, 255)
            reasons = ["wrong side direction"]

        elif view_state == "TOO_SIDE":
            yaw_abs = abs(signed_yaw) if signed_yaw is not None else 0.0
            strong_posture_change = (
                delta_cva >= 1.8 or
                delta_nose_forward >= 0.018 or
                delta_nose_drop >= 0.040
            )
            if (
                yaw_abs >= EXTREME_TOO_SIDE_YAW or
                s_side_profile >= EXTREME_TOO_SIDE_PROFILE
            ) and (not strong_posture_change):
                guide_mode = True
                header_text = "TURN A BIT FRONT"
                header_color = (0, 255, 255)
                reasons = ["camera too side"]

        elif (
            opposite_pack is not None and
            opposite_pack["view_quality"] > current_pack["view_quality"] + OPPOSITE_VIEW_QUALITY_MARGIN and
            delta_cva < 2.0 and delta_nose_forward < 0.020
        ):
            guide_mode = True
            header_text = "SHOW OTHER SIDE"
            header_color = (0, 255, 255)
            reasons = ["other side fits camera better"]

        elif (
            delta_nose_drop >= UNMEASURABLE_NOSE_DROP and
            delta_nose_forward <= UNMEASURABLE_NOSE_FORWARD_MAX
        ):
            guide_mode = True
            header_text = "UNMEASURABLE"
            header_color = (255, 200, 0)
            reasons = ["pose not measurable"]

        if guide_mode:
            self.clear_point_history(self.locked_side)
            self.bad_since = None
            self.state = "GOOD"
            self.caution_enter_count = 0
            self.bad_enter_count = 0
            self.good_return_count = 0

            return self._build_ui(
                header_text,
                header_color,
                "LEVEL: GUIDE",
                "Score: 0 / Avg: 0.0",
                [
                    f"ActiveMode: {active_mode_text}",
                    "OverlayMode: SIDE_3POINT",
                    f"CVA: {s_cva:.2f}",
                    f"DeltaCVA: {delta_cva:.2f}",
                    f"EarForward: {s_ear_forward:.4f}",
                    f"DeltaEarForward: {delta_ear_forward:.4f}",
                    f"NoseForward: {s_nose_forward:.4f}",
                    f"DeltaNoseForward: {delta_nose_forward:.4f}",
                    f"NoseDrop: {delta_nose_drop:.4f}",
                    f"SideProfile: {s_side_profile:.4f}",
                    f"ShoulderShift: {shoulder_shift:.4f}",
                    f"ScaleRatio: {scale_ratio:.3f}",
                    f"YawProxy: {signed_yaw:.4f}" if signed_yaw is not None else "YawProxy: None",
                    f"ViewState: {view_state}",
                    f"ViewQuality: {view_quality:.3f}",
                    f"Reasons: {', '.join(reasons)}",
                    "BAD Sustain: 0.0s",
                ],
                False
            )

        if in_grace:
            raw_score = 0
            reasons = ["stabilizing"]
        else:
            raw_score, reasons = self.classify_score(
                s_cva=s_cva,
                delta_cva=delta_cva,
                delta_ear_forward=delta_ear_forward,
                delta_nose_forward=delta_nose_forward,
                delta_nose_drop=delta_nose_drop
            )

        self.history["raw_score"].append(raw_score)
        avg_score = mean_last(self.history["raw_score"], SIDE_RAW_SCORE_AVG_WINDOW)
        avg_score = 0.0 if avg_score is None else round(avg_score, 2)

        is_real_bad = (
            (delta_cva >= 3.5 and delta_nose_forward >= 0.027) or
            (delta_nose_forward >= 0.077) or
            (delta_nose_drop >= 0.082 and delta_nose_forward >= 0.022) or
            (s_cva <= EXTREME_ABS_CVA_BAD and delta_cva >= 2.8) or
            (raw_score >= SIDE_BAD_SCORE)
        )

        if is_real_bad:
            self.bad_enter_count += 1
            self.caution_enter_count += 1
            self.good_return_count = 0
        elif raw_score >= SIDE_CAUTION_SCORE:
            self.caution_enter_count += 1
            self.bad_enter_count = 0
            self.good_return_count = 0
        else:
            self.good_return_count += 1
            self.caution_enter_count = 0
            self.bad_enter_count = 0

        prev_state = self.state

        if self.state == "GOOD":
            if self.bad_enter_count >= SIDE_BAD_ENTER_FRAMES:
                self.state = "BAD"
            elif self.caution_enter_count >= SIDE_CAUTION_ENTER_FRAMES:
                self.state = "CAUTION"

        elif self.state == "CAUTION":
            if self.bad_enter_count >= SIDE_BAD_ENTER_FRAMES:
                self.state = "BAD"
            elif self.good_return_count >= SIDE_GOOD_RETURN_FRAMES:
                self.state = "GOOD"

        elif self.state == "BAD":
            if self.good_return_count >= SIDE_GOOD_RETURN_FRAMES:
                self.state = "GOOD"
            elif (not is_real_bad) and self.caution_enter_count >= SIDE_BAD_TO_CAUTION_FRAMES:
                self.state = "CAUTION"

        if self.state != prev_state:
            if self.state == "BAD":
                self.bad_since = now
            else:
                self.bad_since = None

        if self.state == "BAD" and self.bad_since is not None:
            bad_sustain = now - self.bad_since
            show_bad_alert = bad_sustain >= SIDE_BAD_ALERT_SECONDS
        else:
            bad_sustain = 0.0
            show_bad_alert = False

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
            f"ActiveMode: {active_mode_text}",
            f"CVA: {s_cva:.2f}",
            f"DeltaCVA: {delta_cva:.2f}",
            f"EarForward: {s_ear_forward:.4f}",
            f"DeltaEarForward: {delta_ear_forward:.4f}",
            f"NoseForward: {s_nose_forward:.4f}",
            f"DeltaNoseForward: {delta_nose_forward:.4f}",
            f"NoseDrop: {delta_nose_drop:.4f}",
            f"SideProfile: {s_side_profile:.4f}",
            f"ShoulderShift: {shoulder_shift:.4f}",
            f"ScaleRatio: {scale_ratio:.3f}",
            f"YawProxy: {signed_yaw:.4f}" if signed_yaw is not None else "YawProxy: None",
            f"ViewState: {view_state}",
            f"ViewQuality: {view_quality:.3f}",
            f"Reasons: {', '.join(reasons) if reasons else 'stable'}",
            f"BAD Sustain: {bad_sustain:.1f}s",
        ]

        return self._build_ui(
            header_text,
            header_color,
            f"LEVEL: {self.state}",
            f"Score: {raw_score} / Avg: {avg_score}",
            info_lines,
            show_bad_alert
        )
