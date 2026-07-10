import cv2
import math
import numpy as np

from config import (
    DISPLAY_MIRRORED,
    OBLIQUE_YAW_MIN, OBLIQUE_YAW_MAX, OBLIQUE_TARGET_YAW,
    OBLIQUE_PROFILE_MIN, OBLIQUE_PROFILE_MAX, OBLIQUE_PROFILE_TARGET
)


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


def norm_score(value, threshold, cap=2.5):
    if threshold <= 0:
        return 0.0
    return min(cap, max(0.0, value) / threshold)


def get_lm(landmarks, idx):
    lm = landmarks[idx]
    return {
        "x": lm.x,
        "y": lm.y,
        "z": lm.z,
        "vis": getattr(lm, "visibility", 1.0),
    }


def midpoint(p1, p2):
    return {
        "x": (p1["x"] + p2["x"]) / 2.0,
        "y": (p1["y"] + p2["y"]) / 2.0,
        "z": (p1["z"] + p2["z"]) / 2.0,
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


def user_side_label(internal_side):
    if not DISPLAY_MIRRORED:
        return internal_side
    if internal_side == "LEFT":
        return "RIGHT"
    if internal_side == "RIGHT":
        return "LEFT"
    return internal_side


def calculate_cva(ear, shoulder):
    dx = abs(ear["x"] - shoulder["x"])
    dy = abs(ear["y"] - shoulder["y"])
    return math.degrees(math.atan2(dy, dx + 1e-6))


def kp_to_dict(kp, vis=1.0):
    return {
        "x": kp.x,
        "y": kp.y,
        "z": 0.0,
        "vis": vis,
    }


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


def get_face_detection_nose(face_result, mp_face_detection):
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


def get_face_scale(landmarks, mp_pose, face_result):
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

def make_virtual_ear(raw_ear, nose, shoulder):
    """
    Pose ear landmark를 그대로 쓰지 않고,
    코에서 멀어지는 방향으로 조금 밀어서 tragus 비슷하게 보정.
    y는 어깨 쪽으로 아주 약하게 내려서 안정화.
    """
    ex = raw_ear["x"] + 0.14 * (raw_ear["x"] - nose["x"])
    ey = raw_ear["y"] + 0.06 * (shoulder["y"] - raw_ear["y"])

    return {
        "x": clamp01(ex),
        "y": clamp01(ey),
        "z": raw_ear["z"],
        "vis": raw_ear["vis"],
    }


def get_stable_nose(landmarks, mp_pose, face_result=None, mp_face_detection=None):
    """
    기본은 Pose NOSE.
    Face Detection nose는 Pose NOSE와 충분히 가까울 때만 살짝 섞어서 사용.
    너무 멀리 튀면 버림.
    """
    pose_nose = get_lm(landmarks, mp_pose.PoseLandmark.NOSE.value)

    if face_result is None or mp_face_detection is None:
        return pose_nose

    fd_nose = get_face_detection_nose(face_result, mp_face_detection)
    if fd_nose is None:
        return pose_nose

    dx = abs(fd_nose["x"] - pose_nose["x"])
    dy = abs(fd_nose["y"] - pose_nose["y"])

    # FD 코가 많이 튀면 신뢰하지 않음
    if dx > 0.035 or dy > 0.050:
        return pose_nose

    # 많이 안 튀면 pose를 중심으로 약하게 섞음
    return {
        "x": 0.75 * pose_nose["x"] + 0.25 * fd_nose["x"],
        "y": 0.75 * pose_nose["y"] + 0.25 * fd_nose["y"],
        "z": pose_nose["z"],
        "vis": max(pose_nose["vis"], fd_nose["vis"]),
    }

def get_side_points(landmarks, mp_pose, side_name, face_result=None, mp_face_detection=None):
    nose = get_stable_nose(landmarks, mp_pose, face_result, mp_face_detection)

    if side_name == "LEFT":
        raw_ear = get_lm(landmarks, mp_pose.PoseLandmark.LEFT_EAR.value)
        shoulder = get_lm(landmarks, mp_pose.PoseLandmark.LEFT_SHOULDER.value)
    else:
        raw_ear = get_lm(landmarks, mp_pose.PoseLandmark.RIGHT_EAR.value)
        shoulder = get_lm(landmarks, mp_pose.PoseLandmark.RIGHT_SHOULDER.value)

    ear = make_virtual_ear(raw_ear, nose, shoulder)
    return nose, ear, shoulder

def get_signed_yaw_proxy(landmarks, mp_pose, face_result=None, mp_face_detection=None):
    nose = get_stable_nose(landmarks, mp_pose, face_result, mp_face_detection)

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

def classify_view_state(landmarks, mp_pose, side_name, side_profile, face_result=None, mp_face_detection=None):
    signed_yaw = get_signed_yaw_proxy(landmarks, mp_pose, face_result, mp_face_detection)

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


def calc_view_quality(landmarks, mp_pose, side_name, side_profile, face_result=None, mp_face_detection=None):
    view_state, signed_yaw = classify_view_state(
        landmarks, mp_pose, side_name, side_profile, face_result, mp_face_detection
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



def draw_front_overlay(frame, landmarks, mp_pose, mp_drawing):
    """Front mode: full pose landmarks + key front guide points."""
    if landmarks is None:
        return

    h, w, _ = frame.shape

    nose = get_lm(landmarks, mp_pose.PoseLandmark.NOSE.value)
    left_ear = get_lm(landmarks, mp_pose.PoseLandmark.LEFT_EAR.value)
    right_ear = get_lm(landmarks, mp_pose.PoseLandmark.RIGHT_EAR.value)
    left_shoulder = get_lm(landmarks, mp_pose.PoseLandmark.LEFT_SHOULDER.value)
    right_shoulder = get_lm(landmarks, mp_pose.PoseLandmark.RIGHT_SHOULDER.value)
    mouth_left = get_lm(landmarks, mp_pose.PoseLandmark.MOUTH_LEFT.value)
    mouth_right = get_lm(landmarks, mp_pose.PoseLandmark.MOUTH_RIGHT.value)

    ear_center = midpoint(left_ear, right_ear)
    shoulder_center = midpoint(left_shoulder, right_shoulder)
    mouth_center = midpoint(mouth_left, mouth_right)

    mp_drawing.draw_landmarks(frame, type("R", (), {"landmark": landmarks})(), mp_pose.POSE_CONNECTIONS)

    pts = [
        (int(nose["x"] * w), int(nose["y"] * h), (0, 255, 0)),
        (int(ear_center["x"] * w), int(ear_center["y"] * h), (255, 255, 0)),
        (int(shoulder_center["x"] * w), int(shoulder_center["y"] * h), (255, 0, 0)),
        (int(mouth_center["x"] * w), int(mouth_center["y"] * h), (0, 200, 255)),
    ]
    for px, py, c in pts:
        cv2.circle(frame, (px, py), 6, c, -1)

    cv2.line(
        frame,
        (int(nose["x"] * w), int(nose["y"] * h)),
        (int(shoulder_center["x"] * w), int(shoulder_center["y"] * h)),
        (0, 255, 255), 2
    )
    cv2.line(
        frame,
        (int(left_shoulder["x"] * w), int(left_shoulder["y"] * h)),
        (int(right_shoulder["x"] * w), int(right_shoulder["y"] * h)),
        (220, 220, 220), 2
    )


def draw_side_three_point_overlay(frame, pack):
    """Side mode: only draw the points actually used for side scoring."""
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
