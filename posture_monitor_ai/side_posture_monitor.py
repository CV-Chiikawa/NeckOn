# side_posture_monitor_v10.py
import cv2
import mediapipe as mp
import numpy as np
import math
import time
from collections import deque

# =========================================
# 기본 설정
# =========================================
CAMERA_INDEX = 0
DISPLAY_MIRRORED = True

BASELINE_SECONDS = 3.0
POST_BASELINE_GRACE = 2.0

SMOOTHING_WINDOW = 11
RAW_SCORE_AVG_WINDOW = 11
LANDMARK_SMOOTH_WINDOW = 5

MIN_VISIBILITY = 0.35

# 상태 전환 프레임 수
CAUTION_ENTER_FRAMES = 3
BAD_ENTER_FRAMES = 3
GOOD_RETURN_FRAMES = 10

BAD_ALERT_SECONDS = 1.5

BAD_TO_CAUTION_FRAMES = 4

# =========================================
# 사측면(실사용 oblique) 설정
# =========================================
OBLIQUE_YAW_MIN = 0.08
OBLIQUE_YAW_MAX = 0.95
OBLIQUE_TARGET_YAW = 0.58

OBLIQUE_PROFILE_MIN = 0.040
OBLIQUE_PROFILE_MAX = 0.190
OBLIQUE_PROFILE_TARGET = 0.125

VIEW_QUALITY_OK_MIN = 0.18
OPPOSITE_VIEW_QUALITY_MARGIN = 0.40

# TOO_SIDE는 극단일 때만 GUIDE
EXTREME_TOO_SIDE_YAW = 1.45
EXTREME_TOO_SIDE_PROFILE = 0.205

# 거리 보정 시 과보정 방지
MIN_SCALE_RATIO = 0.75
MAX_SCALE_RATIO = 1.35

# =========================================
# 점수화 기준
# =========================================
EXTREME_ABS_CVA_BAD = 60.0

DELTA_CVA_CAUTION_1 = 1.8
DELTA_CVA_CAUTION_2 = 5.0

NOSE_FORWARD_CAUTION_1 = 0.018
NOSE_FORWARD_BAD_1 = 0.040

EAR_FORWARD_BAD_1 = 0.055

CHIN_DROP_CAUTION_1 = 0.040
CHIN_DROP_BAD_1 = 0.095

# 측정 불가 포즈
UNMEASURABLE_NOSE_DROP = 0.160
UNMEASURABLE_NOSE_FORWARD_MAX = 0.020

# =========================================
# MediaPipe 초기화
# =========================================
mp_pose = mp.solutions.pose
mp_face_detection = mp.solutions.face_detection

pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=1,
    smooth_landmarks=True,
    enable_segmentation=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

face_detection = mp_face_detection.FaceDetection(
    model_selection=0,
    min_detection_confidence=0.5
)

# =========================================
# 유틸 함수
# =========================================
def put_text(frame, text, x, y, color=(255, 255, 255), scale=0.8, thickness=2):
    cv2.putText(
        frame, text, (x, y),
        cv2.FONT_HERSHEY_SIMPLEX,
        scale, color, thickness, cv2.LINE_AA
    )


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def clamp01(v):
    return max(0.0, min(1.0, v))


def get_lm(landmarks, idx):
    lm = landmarks[idx]
    return {
        "x": lm.x,
        "y": lm.y,
        "z": lm.z,
        "vis": getattr(lm, "visibility", 1.0)
    }


def kp_to_dict(kp, vis=1.0):
    return {
        "x": kp.x,
        "y": kp.y,
        "z": 0.0,
        "vis": vis,
    }


def mean_last(values, window):
    if len(values) == 0:
        return None
    arr = list(values)[-window:]
    return float(sum(arr) / len(arr))


def median_or_none(values):
    if len(values) == 0:
        return None
    return float(np.median(values))


def calculate_cva(ear, shoulder):
    """
    어깨 -> 귀 선과 수평선 사이 각도
    값이 작아질수록 머리가 앞으로 나온 것으로 해석
    """
    dx = abs(ear["x"] - shoulder["x"])
    dy = abs(ear["y"] - shoulder["y"])
    return math.degrees(math.atan2(dy, dx + 1e-6))


def user_side_label(internal_side):
    if not DISPLAY_MIRRORED:
        return internal_side
    if internal_side == "LEFT":
        return "RIGHT"
    if internal_side == "RIGHT":
        return "LEFT"
    return internal_side


# =========================================
# Face detection 관련
# =========================================
def get_best_face_detection(face_result):
    if face_result is None or not face_result.detections:
        return None

    best_det = None
    best_area = -1.0

    for det in face_result.detections:
        bbox = det.location_data.relative_bounding_box
        area = bbox.width * bbox.height
        if area > best_area:
            best_area = area
            best_det = det

    return best_det


def get_face_detection_nose(face_result):
    det = get_best_face_detection(face_result)
    if det is None:
        return None

    try:
        nose_kp = mp_face_detection.get_key_point(
            det, mp_face_detection.FaceKeyPoint.NOSE_TIP
        )
        return kp_to_dict(nose_kp, vis=1.0)
    except Exception:
        return None


def get_face_bbox_width(face_result):
    det = get_best_face_detection(face_result)
    if det is None:
        return None

    try:
        bbox = det.location_data.relative_bounding_box
        return float(bbox.width)
    except Exception:
        return None


def get_face_scale(landmarks, face_result):
    """
    거리 보정을 위한 얼굴 스케일
    - 1순위: face detection bbox width
    - 2순위: 양쪽 귀 거리
    """
    bbox_w = get_face_bbox_width(face_result)
    if bbox_w is not None and bbox_w > 0.05:
        return bbox_w

    left_ear = get_lm(landmarks, mp_pose.PoseLandmark.LEFT_EAR.value)
    right_ear = get_lm(landmarks, mp_pose.PoseLandmark.RIGHT_EAR.value)

    if left_ear["vis"] > 0.35 and right_ear["vis"] > 0.35:
        ear_dist = abs(right_ear["x"] - left_ear["x"])
        if ear_dist > 0.03:
            return ear_dist

    return 0.18


# =========================================
# 버퍼
# =========================================
def make_metric_buffer():
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


def make_history():
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


def make_point_history():
    return {
        "nose_x": deque(maxlen=15),
        "nose_y": deque(maxlen=15),
        "ear_x": deque(maxlen=15),
        "ear_y": deque(maxlen=15),
        "shoulder_x": deque(maxlen=15),
        "shoulder_y": deque(maxlen=15),
    }


def clear_point_history(point_history):
    for k in point_history:
        point_history[k].clear()


def smooth_point(point_history, prefix, point, window):
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


# =========================================
# 랜드마크 / 사측면 판정
# =========================================
def get_side_points(landmarks, side_name, face_result=None):
    pose_nose = get_lm(landmarks, mp_pose.PoseLandmark.NOSE.value)
    fd_nose = get_face_detection_nose(face_result)
    nose = fd_nose if fd_nose is not None else pose_nose

    if side_name == "LEFT":
        ear = get_lm(landmarks, mp_pose.PoseLandmark.LEFT_EAR.value)
        shoulder = get_lm(landmarks, mp_pose.PoseLandmark.LEFT_SHOULDER.value)
    else:
        ear = get_lm(landmarks, mp_pose.PoseLandmark.RIGHT_EAR.value)
        shoulder = get_lm(landmarks, mp_pose.PoseLandmark.RIGHT_SHOULDER.value)

    return nose, ear, shoulder


def get_smoothed_side_points(ctx, landmarks, side_name, face_result=None):
    nose, ear, shoulder = get_side_points(landmarks, side_name, face_result)

    hist = ctx["point_history"][side_name]
    nose = smooth_point(hist, "nose", nose, LANDMARK_SMOOTH_WINDOW)
    ear = smooth_point(hist, "ear", ear, LANDMARK_SMOOTH_WINDOW)
    shoulder = smooth_point(hist, "shoulder", shoulder, LANDMARK_SMOOTH_WINDOW)

    return nose, ear, shoulder


def get_signed_yaw_proxy(landmarks, face_result=None):
    """
    정면이면 0 근처
    한쪽으로 돌수록 절댓값 증가
    """
    pose_nose = get_lm(landmarks, mp_pose.PoseLandmark.NOSE.value)
    fd_nose = get_face_detection_nose(face_result)
    nose = fd_nose if fd_nose is not None else pose_nose

    left_ear = get_lm(landmarks, mp_pose.PoseLandmark.LEFT_EAR.value)
    right_ear = get_lm(landmarks, mp_pose.PoseLandmark.RIGHT_EAR.value)

    if left_ear["vis"] < 0.35 or right_ear["vis"] < 0.35:
        return None

    ear_dist = abs(right_ear["x"] - left_ear["x"])
    if ear_dist < 0.03:
        return None

    ear_mid_x = (left_ear["x"] + right_ear["x"]) / 2.0
    signed_yaw = (nose["x"] - ear_mid_x) / (ear_dist + 1e-6)
    return signed_yaw


def classify_view_state(landmarks, side_name, side_profile, face_result=None):
    signed_yaw = get_signed_yaw_proxy(landmarks, face_result)

    if signed_yaw is not None:
        if side_name == "RIGHT" and signed_yaw <= 0:
            return "WRONG_SIDE", signed_yaw
        if side_name == "LEFT" and signed_yaw >= 0:
            return "WRONG_SIDE", signed_yaw

        yaw_abs = abs(signed_yaw)

        if yaw_abs < OBLIQUE_YAW_MIN:
            return "TOO_FRONT", signed_yaw
        if yaw_abs > OBLIQUE_YAW_MAX:
            return "TOO_SIDE", signed_yaw

        return "OK", signed_yaw

    if side_profile < OBLIQUE_PROFILE_MIN:
        return "TOO_FRONT", None
    if side_profile > OBLIQUE_PROFILE_MAX:
        return "TOO_SIDE", None

    return "OK", None


def calc_view_quality(landmarks, side_name, side_profile, face_result=None):
    view_state, signed_yaw = classify_view_state(
        landmarks, side_name, side_profile, face_result
    )

    if view_state == "WRONG_SIDE":
        return 0.0, signed_yaw, view_state

    yaw_quality = 0.5
    if signed_yaw is not None:
        yaw_abs = abs(signed_yaw)
        yaw_half = (OBLIQUE_YAW_MAX - OBLIQUE_YAW_MIN) / 2.0
        yaw_quality = 1.0 - abs(yaw_abs - OBLIQUE_TARGET_YAW) / (yaw_half + 1e-6)
        yaw_quality = clamp01(yaw_quality)

    profile_half = (OBLIQUE_PROFILE_MAX - OBLIQUE_PROFILE_MIN) / 2.0
    profile_quality = 1.0 - abs(side_profile - OBLIQUE_PROFILE_TARGET) / (profile_half + 1e-6)
    profile_quality = clamp01(profile_quality)

    if view_state in ["TOO_FRONT", "TOO_SIDE"]:
        quality = 0.25 * yaw_quality + 0.10 * profile_quality
    else:
        quality = 0.70 * yaw_quality + 0.30 * profile_quality

    return quality, signed_yaw, view_state


def calc_side_pack(ctx, landmarks, side_name, face_result=None):
    nose, ear, shoulder = get_smoothed_side_points(
        ctx, landmarks, side_name, face_result
    )

    visible_ok = (
        ear["vis"] >= MIN_VISIBILITY and
        shoulder["vis"] >= MIN_VISIBILITY
    )
    if not visible_ok:
        return None

    face_scale = get_face_scale(landmarks, face_result)

    cva = calculate_cva(ear, shoulder)
    ear_forward = abs(ear["x"] - shoulder["x"])
    nose_forward = abs(nose["x"] - shoulder["x"])
    nose_y = nose["y"]
    side_profile = abs(nose["x"] - ear["x"])
    shoulder_y = shoulder["y"]

    view_quality, yaw_proxy, view_state = calc_view_quality(
        landmarks, side_name, side_profile, face_result
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


def draw_side_overlay(frame, pack):
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


# =========================================
# 점수화
# =========================================
def classify_score(
    s_cva,
    delta_cva,
    delta_ear_forward,
    delta_nose_forward,
    delta_nose_drop
):
    score = 0
    reasons = []

    # 개별 점수
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

    # 조합 보너스
    combo_count = int(cva_hit) + int(nose_hit) + int(chin_hit)
    if combo_count >= 2:
        score += 1
        reasons.append("combined forward head")

    return score, reasons

def reset_all():
    return {
        "mode": "baseline",
        "baseline_start_time": time.time(),
        "monitor_start_time": None,

        "baseline_buffer": {
            "LEFT": make_metric_buffer(),
            "RIGHT": make_metric_buffer(),
        },

        "point_history": {
            "LEFT": make_point_history(),
            "RIGHT": make_point_history(),
        },

        "locked_side_internal": None,
        "baseline": None,

        "history": make_history(),

        "state": "GOOD",
        "bad_since": None,

        "caution_enter_count": 0,
        "bad_enter_count": 0,
        "good_return_count": 0,
    }


# =========================================
# 시작
# =========================================
cap = cv2.VideoCapture(CAMERA_INDEX)
if not cap.isOpened():
    print("카메라를 열 수 없습니다.")
    exit()

ctx = reset_all()

print("Oblique side posture monitor 시작")
print("q 또는 ESC : 종료")
print("r : baseline 재설정")

while True:
    ret, frame_raw = cap.read()
    if not ret:
        print("프레임을 읽을 수 없습니다.")
        break

    frame_draw = frame_raw.copy()
    rgb = cv2.cvtColor(frame_raw, cv2.COLOR_BGR2RGB)

    result = pose.process(rgb)
    face_result = face_detection.process(rgb)

    header_text = "NO POSE"
    header_color = (255, 255, 255)
    level_text = "LEVEL: GUIDE"
    score_text = "Score: -"
    info_lines = []
    show_bad_alert = False

    if result.pose_landmarks:
        landmarks = result.pose_landmarks.landmark

        left_pack = calc_side_pack(ctx, landmarks, "LEFT", face_result)
        right_pack = calc_side_pack(ctx, landmarks, "RIGHT", face_result)

        preview_pack = None
        if left_pack is not None and right_pack is not None:
            preview_pack = left_pack if left_pack["view_quality"] >= right_pack["view_quality"] else right_pack
        elif left_pack is not None:
            preview_pack = left_pack
        elif right_pack is not None:
            preview_pack = right_pack

        # =====================================
        # baseline 모드
        # =====================================
        if ctx["mode"] == "baseline":
            elapsed = time.time() - ctx["baseline_start_time"]

            if left_pack is not None and left_pack["view_state"] == "OK":
                for k in ctx["baseline_buffer"]["LEFT"]:
                    ctx["baseline_buffer"]["LEFT"][k].append(left_pack[k])

            if right_pack is not None and right_pack["view_state"] == "OK":
                for k in ctx["baseline_buffer"]["RIGHT"]:
                    ctx["baseline_buffer"]["RIGHT"][k].append(right_pack[k])

            if preview_pack is not None:
                draw_side_overlay(frame_draw, preview_pack)

            header_text = f"Saving baseline... {max(0, int(BASELINE_SECONDS - elapsed) + 1)}s"
            header_color = (255, 255, 255)
            level_text = "LEVEL: GUIDE"
            score_text = "Score: 0 / Avg: 0.0"

            info_lines = [
                "Keep a natural oblique side posture",
                "Recommended camera angle: about 40~65 deg",
                "Auto side lock in progress",
            ]

            if elapsed >= BASELINE_SECONDS:
                left_q = median_or_none(ctx["baseline_buffer"]["LEFT"]["view_quality"])
                right_q = median_or_none(ctx["baseline_buffer"]["RIGHT"]["view_quality"])

                both_bad = (
                    (left_q is None or left_q < VIEW_QUALITY_OK_MIN) and
                    (right_q is None or right_q < VIEW_QUALITY_OK_MIN)
                )

                if both_bad:
                    ctx["baseline_start_time"] = time.time()
                    ctx["baseline_buffer"] = {
                        "LEFT": make_metric_buffer(),
                        "RIGHT": make_metric_buffer(),
                    }
                    clear_point_history(ctx["point_history"]["LEFT"])
                    clear_point_history(ctx["point_history"]["RIGHT"])
                else:
                    if left_q is None:
                        locked_side = "RIGHT"
                        chosen_buffer = ctx["baseline_buffer"]["RIGHT"]
                    elif right_q is None:
                        locked_side = "LEFT"
                        chosen_buffer = ctx["baseline_buffer"]["LEFT"]
                    else:
                        if left_q >= right_q:
                            locked_side = "LEFT"
                            chosen_buffer = ctx["baseline_buffer"]["LEFT"]
                        else:
                            locked_side = "RIGHT"
                            chosen_buffer = ctx["baseline_buffer"]["RIGHT"]

                    ctx["baseline"] = {}
                    for k in [
                        "cva", "ear_forward", "nose_forward", "nose_y",
                        "side_profile", "shoulder_y", "face_scale"
                    ]:
                        ctx["baseline"][k] = median_or_none(chosen_buffer[k])

                    if any(v is None for v in ctx["baseline"].values()):
                        ctx = reset_all()
                    else:
                        ctx["locked_side_internal"] = locked_side
                        ctx["mode"] = "monitor"
                        ctx["monitor_start_time"] = time.time()

                        print("baseline 저장 완료")
                        print("internal locked side:", ctx["locked_side_internal"])
                        print("display side:", user_side_label(ctx["locked_side_internal"]))
                        print("baseline:", ctx["baseline"])

        # =====================================
        # monitor 모드
        # =====================================
        elif ctx["mode"] == "monitor":
            locked_internal = ctx["locked_side_internal"]
            locked_display = user_side_label(locked_internal)

            current_pack = left_pack if locked_internal == "LEFT" else right_pack
            opposite_pack = right_pack if locked_internal == "LEFT" else left_pack

            if current_pack is not None:
                draw_side_overlay(frame_draw, current_pack)

            guide_mode = False
            raw_score = 0
            avg_score = 0.0
            bad_sustain = 0.0
            reasons = []

            if current_pack is None:
                guide_mode = True
                clear_point_history(ctx["point_history"][locked_internal])

                header_text = "ADJUST CAMERA"
                header_color = (0, 255, 255)
                level_text = "LEVEL: GUIDE"
                score_text = "Score: 0 / Avg: 0.0"

                ctx["bad_since"] = None
                ctx["state"] = "GOOD"
                ctx["caution_enter_count"] = 0
                ctx["bad_enter_count"] = 0
                ctx["good_return_count"] = 0

                info_lines = [
                    f"LockedSide: {locked_display}",
                    "Current side not visible enough",
                ]

            else:
                # raw metric history
                ctx["history"]["cva"].append(current_pack["cva"])
                ctx["history"]["ear_forward"].append(current_pack["ear_forward"])
                ctx["history"]["nose_forward"].append(current_pack["nose_forward"])
                ctx["history"]["nose_y"].append(current_pack["nose_y"])
                ctx["history"]["side_profile"].append(current_pack["side_profile"])
                ctx["history"]["shoulder_y"].append(current_pack["shoulder_y"])
                ctx["history"]["face_scale"].append(current_pack["face_scale"])

                # smoothing
                s_cva = mean_last(ctx["history"]["cva"], SMOOTHING_WINDOW)
                s_ear_forward_raw = mean_last(ctx["history"]["ear_forward"], SMOOTHING_WINDOW)
                s_nose_forward_raw = mean_last(ctx["history"]["nose_forward"], SMOOTHING_WINDOW)
                s_nose_y = mean_last(ctx["history"]["nose_y"], SMOOTHING_WINDOW)
                s_side_profile_raw = mean_last(ctx["history"]["side_profile"], SMOOTHING_WINDOW)
                s_shoulder_y = mean_last(ctx["history"]["shoulder_y"], SMOOTHING_WINDOW)
                s_face_scale = mean_last(ctx["history"]["face_scale"], SMOOTHING_WINDOW)

                base_scale = ctx["baseline"]["face_scale"]
                if base_scale is None or base_scale <= 1e-6 or s_face_scale is None:
                    scale_ratio = 1.0
                else:
                    scale_ratio = s_face_scale / base_scale
                    scale_ratio = clamp(scale_ratio, MIN_SCALE_RATIO, MAX_SCALE_RATIO)

                # 거리 보정: baseline 얼굴 크기에 맞춰 보정
                s_ear_forward = s_ear_forward_raw / scale_ratio
                s_nose_forward = s_nose_forward_raw / scale_ratio
                s_side_profile = s_side_profile_raw / scale_ratio

                delta_cva = ctx["baseline"]["cva"] - s_cva
                delta_ear_forward = s_ear_forward - ctx["baseline"]["ear_forward"]
                delta_nose_forward = s_nose_forward - ctx["baseline"]["nose_forward"]
                delta_nose_drop = (s_nose_y - ctx["baseline"]["nose_y"]) / scale_ratio
                shoulder_shift = abs(s_shoulder_y - ctx["baseline"]["shoulder_y"])

                in_grace = (time.time() - ctx["monitor_start_time"]) < POST_BASELINE_GRACE

                view_quality, signed_yaw, view_state = calc_view_quality(
                    landmarks, locked_internal, s_side_profile, face_result
                )

                # -----------------------------
                # GUIDE 판정
                # -----------------------------
                if view_state == "TOO_FRONT":
                    guide_mode = True
                    header_text = "TURN A BIT SIDE"
                    header_color = (0, 255, 255)
                    level_text = "LEVEL: GUIDE"
                    score_text = "Score: 0 / Avg: 0.0"
                    reasons = ["camera too frontal"]

                elif view_state == "WRONG_SIDE":
                    guide_mode = True
                    header_text = "SHOW OTHER SIDE"
                    header_color = (0, 255, 255)
                    level_text = "LEVEL: GUIDE"
                    score_text = "Score: 0 / Avg: 0.0"
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
                        level_text = "LEVEL: GUIDE"
                        score_text = "Score: 0 / Avg: 0.0"
                        reasons = ["camera too side"]

                elif (
                    opposite_pack is not None and
                    opposite_pack["view_quality"] > current_pack["view_quality"] + OPPOSITE_VIEW_QUALITY_MARGIN and
                    delta_cva < 2.0 and delta_nose_forward < 0.020
                ):
                    guide_mode = True
                    header_text = "SHOW OTHER SIDE"
                    header_color = (0, 255, 255)
                    level_text = "LEVEL: GUIDE"
                    score_text = "Score: 0 / Avg: 0.0"
                    reasons = ["other side fits camera better"]

                elif (
                    delta_nose_drop >= UNMEASURABLE_NOSE_DROP and
                    delta_nose_forward <= UNMEASURABLE_NOSE_FORWARD_MAX
                ):
                    guide_mode = True
                    header_text = "UNMEASURABLE"
                    header_color = (255, 200, 0)
                    level_text = "LEVEL: GUIDE"
                    score_text = "Score: 0 / Avg: 0.0"
                    reasons = ["pose not measurable"]

                if guide_mode:
                    clear_point_history(ctx["point_history"][locked_internal])

                    ctx["bad_since"] = None
                    ctx["state"] = "GOOD"
                    ctx["caution_enter_count"] = 0
                    ctx["bad_enter_count"] = 0
                    ctx["good_return_count"] = 0

                    info_lines = [
                        f"LockedSide: {locked_display}",
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
                        f"BAD Sustain: 0.0s",
                    ]

                else:
                    if in_grace:
                        raw_score = 0
                        reasons = ["stabilizing"]
                    else:
                        raw_score, reasons = classify_score(
                            s_cva=s_cva,
                            delta_cva=delta_cva,
                            delta_ear_forward=delta_ear_forward,
                            delta_nose_forward=delta_nose_forward,
                            delta_nose_drop=delta_nose_drop
                        )

                    ctx["history"]["raw_score"].append(raw_score)
                    avg_score = mean_last(ctx["history"]["raw_score"], RAW_SCORE_AVG_WINDOW)
                    avg_score = 0.0 if avg_score is None else round(avg_score, 2)

                    is_real_bad = (
                        (delta_cva >= 3.5 and delta_nose_forward >= 0.027) or
                        (delta_nose_forward >= 0.077) or
                        (delta_nose_drop >= 0.082 and delta_nose_forward >= 0.022) or
                        (s_cva <= EXTREME_ABS_CVA_BAD and delta_cva >= 2.8)
                    )

                    if is_real_bad:
                        ctx["bad_enter_count"] += 1
                        ctx["caution_enter_count"] += 1
                        ctx["good_return_count"] = 0
                    elif raw_score >= 2:
                        ctx["caution_enter_count"] += 1
                        ctx["bad_enter_count"] = 0
                        ctx["good_return_count"] = 0
                    else:
                        ctx["good_return_count"] += 1
                        ctx["caution_enter_count"] = 0
                        ctx["bad_enter_count"] = 0

                    prev_state = ctx["state"]

                    if ctx["state"] == "GOOD":
                        if ctx["bad_enter_count"] >= BAD_ENTER_FRAMES:
                            ctx["state"] = "BAD"
                        elif ctx["caution_enter_count"] >= CAUTION_ENTER_FRAMES:
                            ctx["state"] = "CAUTION"

                    elif ctx["state"] == "CAUTION":
                        if ctx["bad_enter_count"] >= BAD_ENTER_FRAMES:
                            ctx["state"] = "BAD"
                        elif ctx["good_return_count"] >= GOOD_RETURN_FRAMES:
                            ctx["state"] = "GOOD"

                    elif ctx["state"] == "BAD":
                        if ctx["good_return_count"] >= GOOD_RETURN_FRAMES:
                            ctx["state"] = "GOOD"
                        elif (not is_real_bad) and ctx["caution_enter_count"] >= BAD_TO_CAUTION_FRAMES:
                            ctx["state"] = "CAUTION"

                    if ctx["state"] != prev_state:
                        if ctx["state"] == "BAD":
                            ctx["bad_since"] = time.time()
                        else:
                            ctx["bad_since"] = None

                    if ctx["state"] == "BAD" and ctx["bad_since"] is not None:
                        bad_sustain = time.time() - ctx["bad_since"]
                        if bad_sustain >= BAD_ALERT_SECONDS:
                            show_bad_alert = True
                    else:
                        bad_sustain = 0.0
                        show_bad_alert = False

                    if ctx["state"] == "GOOD":
                        header_text = "Good posture"
                        header_color = (0, 255, 0)
                    elif ctx["state"] == "CAUTION":
                        header_text = "Caution posture"
                        header_color = (0, 255, 255)
                    else:
                        header_text = "Bad posture risk"
                        header_color = (0, 0, 255)

                    level_text = f"LEVEL: {ctx['state']}"
                    score_text = f"Score: {raw_score} / Avg: {avg_score}"

                    info_lines = [
                        f"LockedSide: {locked_display}",
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

    else:
        header_text = "NO POSE"
        header_color = (255, 255, 255)
        level_text = "LEVEL: GUIDE"
        score_text = "Score: -"
        info_lines = ["Pose not detected"]
        show_bad_alert = False
        ctx["bad_since"] = None

    if DISPLAY_MIRRORED:
        frame_show = cv2.flip(frame_draw, 1)
    else:
        frame_show = frame_draw

    put_text(frame_show, header_text, 30, 35, header_color, 1.0, 3)
    put_text(frame_show, level_text, 30, 70, (255, 255, 255), 0.8, 2)
    put_text(frame_show, score_text, 30, 105, (255, 255, 255), 0.8, 2)

    if show_bad_alert:
        put_text(frame_show, "BAD POSTURE ALERT", 30, 140, (0, 0, 255), 1.0, 3)

    y0 = 190 if show_bad_alert else 165
    dy = 38
    for i, line in enumerate(info_lines):
        put_text(frame_show, line, 30, y0 + i * dy, (255, 255, 255), 0.8, 2)

    cv2.imshow("Side Posture Monitor", frame_show)

    key = cv2.waitKey(1) & 0xFF
    if key == 27 or key == ord("q"):
        break
    elif key == ord("r"):
        ctx = reset_all()
        print("baseline 재설정")

cap.release()
cv2.destroyAllWindows()
pose.close()
face_detection.close()
