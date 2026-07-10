import cv2
import mediapipe as mp
import numpy as np
import time
from collections import deque

# ----------------------------
# 설정값
# ----------------------------
BASELINE_SECONDS = 3
SMOOTHING_WINDOW = 7

# 정면 자세 기준 임계값
HEAD_TILT_THRESHOLD = 0.040
SHOULDER_TILT_THRESHOLD = 0.035
CENTER_OFFSET_THRESHOLD = 0.050

# 전방 이동 / 턱 하강 관련
NOSE_FORWARD_Z_THRESHOLD = 0.16
EAR_FORWARD_Z_THRESHOLD = 0.10
NOSE_DROP_THRESHOLD = 0.080
FACE_SHOULDER_RATIO_THRESHOLD = 0.10

# 거리 안내 기준
TOO_CLOSE_RATIO = 1.60
TOO_FAR_RATIO = 0.72

# 정면 측정 범위 이탈 기준
MAX_HEAD_TILT_FOR_SCORING = 0.095
MAX_CENTER_OFFSET_FOR_SCORING = 0.120

# 상태 전이 점수
CAUTION_SCORE = 2
BAD_SCORE = 4

# 상태 전이 프레임 수
CAUTION_ENTER_FRAMES = 5
BAD_ENTER_FRAMES = 5
NORMAL_RETURN_FRAMES = 6

# BAD ALERT 유지 시간
BAD_ALERT_SECONDS = 1.3

# ----------------------------
# MediaPipe 초기화
# ----------------------------
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils

pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=1,
    smooth_landmarks=True,
    enable_segmentation=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# ----------------------------
# 유틸 함수
# ----------------------------
def get_lm(landmarks, idx):
    lm = landmarks[idx]
    return {
        "x": lm.x,
        "y": lm.y,
        "z": lm.z,
        "vis": lm.visibility if hasattr(lm, "visibility") else 1.0
    }

def midpoint(p1, p2):
    return {
        "x": (p1["x"] + p2["x"]) / 2.0,
        "y": (p1["y"] + p2["y"]) / 2.0,
        "z": (p1["z"] + p2["z"]) / 2.0,
    }

def mean_last(values, window):
    if not values:
        return None
    arr = list(values)[-window:]
    return sum(arr) / len(arr)

def norm_score(value, threshold, cap=2.5):
    if threshold <= 0:
        return 0.0
    return min(cap, max(0.0, value) / threshold)

def put(frame, text, x, y, color=(255, 255, 255), scale=0.8, thickness=2):
    cv2.putText(
        frame, text, (x, y),
        cv2.FONT_HERSHEY_SIMPLEX,
        scale, color, thickness, cv2.LINE_AA
    )

# ----------------------------
# 상태 변수
# ----------------------------
mode = "baseline"
baseline_start_time = time.time()

baseline_buffer = {
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

baseline = {}

history = {
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

state = "NORMAL"
bad_since = None
caution_enter_count = 0
bad_enter_count = 0
normal_return_count = 0

# ----------------------------
# 카메라 열기
# ----------------------------
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("카메라를 열 수 없습니다.")
    exit()

print("정면 기준 자세 저장 시작")
print(f"처음 {BASELINE_SECONDS}초 동안 평소 모니터 보는 자연스러운 자세를 유지하세요.")
print("r: 기준 자세 재측정 / q 또는 ESC: 종료")

while True:
    ret, frame = cap.read()
    if not ret:
        print("프레임을 읽을 수 없습니다.")
        break

    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = pose.process(rgb)

    header_text = "NO POSE"
    level_text = f"LEVEL: {state}"
    score_text = "Score: -"
    header_color = (255, 255, 255)

    if result.pose_landmarks:
        landmarks = result.pose_landmarks.landmark

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

        # ----------------------------
        # 특징값 계산
        # ----------------------------
        head_tilt = left_ear["y"] - right_ear["y"]
        shoulder_tilt = left_shoulder["y"] - right_shoulder["y"]
        center_offset = nose["x"] - shoulder_center["x"]

        ear_avg_z = (left_ear["z"] + right_ear["z"]) / 2.0
        nose_z = nose["z"]
        nose_y = nose["y"]

        face_width = abs(left_ear["x"] - right_ear["x"])
        shoulder_width = abs(left_shoulder["x"] - right_shoulder["x"])
        face_shoulder_ratio = face_width / (shoulder_width + 1e-6)

        # smoothing 저장
        history["head_tilt"].append(head_tilt)
        history["shoulder_tilt"].append(shoulder_tilt)
        history["center_offset"].append(center_offset)
        history["nose_z"].append(nose_z)
        history["ear_z"].append(ear_avg_z)
        history["nose_y"].append(nose_y)
        history["face_width"].append(face_width)
        history["shoulder_width"].append(shoulder_width)
        history["face_shoulder_ratio"].append(face_shoulder_ratio)

        s_head_tilt = mean_last(history["head_tilt"], SMOOTHING_WINDOW)
        s_shoulder_tilt = mean_last(history["shoulder_tilt"], SMOOTHING_WINDOW)
        s_center_offset = mean_last(history["center_offset"], SMOOTHING_WINDOW)
        s_nose_z = mean_last(history["nose_z"], SMOOTHING_WINDOW)
        s_ear_z = mean_last(history["ear_z"], SMOOTHING_WINDOW)
        s_nose_y = mean_last(history["nose_y"], SMOOTHING_WINDOW)
        s_face_width = mean_last(history["face_width"], SMOOTHING_WINDOW)
        s_shoulder_width = mean_last(history["shoulder_width"], SMOOTHING_WINDOW)
        s_face_shoulder_ratio = mean_last(history["face_shoulder_ratio"], SMOOTHING_WINDOW)

        # ----------------------------
        # baseline 저장
        # ----------------------------
        if mode == "baseline":
            elapsed = time.time() - baseline_start_time
            header_text = f"Saving baseline... {max(0, BASELINE_SECONDS - int(elapsed))}s"
            header_color = (255, 255, 255)

            baseline_buffer["head_tilt"].append(s_head_tilt)
            baseline_buffer["shoulder_tilt"].append(s_shoulder_tilt)
            baseline_buffer["center_offset"].append(s_center_offset)
            baseline_buffer["nose_z"].append(s_nose_z)
            baseline_buffer["ear_z"].append(s_ear_z)
            baseline_buffer["nose_y"].append(s_nose_y)
            baseline_buffer["face_width"].append(s_face_width)
            baseline_buffer["shoulder_width"].append(s_shoulder_width)
            baseline_buffer["face_shoulder_ratio"].append(s_face_shoulder_ratio)

            if elapsed >= BASELINE_SECONDS:
                baseline = {k: float(np.mean(v)) for k, v in baseline_buffer.items()}
                mode = "monitor"
                state = "NORMAL"
                bad_since = None
                caution_enter_count = 0
                bad_enter_count = 0
                normal_return_count = 0

                print("기준 자세 저장 완료")
                print(baseline)

        # ----------------------------
        # monitor
        # ----------------------------
        elif mode == "monitor":
            # baseline 대비 변화량
            d_head_tilt = abs(s_head_tilt - baseline["head_tilt"])
            d_shoulder_tilt = abs(s_shoulder_tilt - baseline["shoulder_tilt"])
            d_center_offset = abs(s_center_offset - baseline["center_offset"])

            d_nose_forward = baseline["nose_z"] - s_nose_z
            d_ear_forward = baseline["ear_z"] - s_ear_z
            d_nose_drop = s_nose_y - baseline["nose_y"]
            d_face_shoulder_ratio = s_face_shoulder_ratio - baseline["face_shoulder_ratio"]

            # 거리 체크
            distance_ratio = s_face_width / (baseline["face_width"] + 1e-6)
            too_close = distance_ratio > TOO_CLOSE_RATIO
            too_far = distance_ratio < TOO_FAR_RATIO

            # 정면 측정 범위 이탈 체크
            out_of_scope = (
                d_head_tilt > MAX_HEAD_TILT_FOR_SCORING
                or d_center_offset > MAX_CENTER_OFFSET_FOR_SCORING
                or (d_head_tilt > 0.070 and d_center_offset > 0.060)
            )

            raw_score = 0
            reasons = []
            guidance_text = None
            guidance_color = (255, 255, 255)

            # ----------------------------
            # 안내 메시지 우선
            # ----------------------------
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
                # ----------------------------
                # 정면 자세 점수 계산
                # ----------------------------
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

                # reasons
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

                # Good / Caution / Bad 결정
                if forward_score < 1.15 and imbalance_score < 1.05:
                    raw_score = 0
                elif forward_score >= 2.55 or (forward_score >= 2.05 and imbalance_score >= 1.15):
                    raw_score = BAD_SCORE
                elif forward_score >= 1.20 or imbalance_score >= 1.10:
                    raw_score = CAUTION_SCORE
                else:
                    raw_score = 0

            history["raw_score"].append(raw_score)
            avg_score = round(mean_last(history["raw_score"], 5), 2)

            # ----------------------------
            # 상태 전이
            # ----------------------------
            if raw_score >= BAD_SCORE:
                bad_enter_count += 1
                caution_enter_count += 1
                normal_return_count = 0
            elif raw_score >= CAUTION_SCORE:
                caution_enter_count += 1
                bad_enter_count = 0
                normal_return_count = 0
            else:
                normal_return_count += 1
                caution_enter_count = 0
                bad_enter_count = 0

            prev_state = state

            if state == "NORMAL":
                if bad_enter_count >= BAD_ENTER_FRAMES:
                    state = "BAD"
                elif caution_enter_count >= CAUTION_ENTER_FRAMES:
                    state = "CAUTION"

            elif state == "CAUTION":
                if bad_enter_count >= BAD_ENTER_FRAMES:
                    state = "BAD"
                elif normal_return_count >= NORMAL_RETURN_FRAMES:
                    state = "NORMAL"

            elif state == "BAD":
                if normal_return_count >= NORMAL_RETURN_FRAMES:
                    state = "NORMAL"
                elif caution_enter_count >= CAUTION_ENTER_FRAMES and raw_score < BAD_SCORE:
                    state = "CAUTION"

            if state != prev_state:
                if state == "BAD":
                    bad_since = time.time()
                elif state != "BAD":
                    bad_since = None

            # BAD ALERT
            bad_sustain = 0.0
            alert = False
            if state == "BAD" and bad_since is not None:
                bad_sustain = time.time() - bad_since
                if bad_sustain >= BAD_ALERT_SECONDS:
                    alert = True

            # 헤더 텍스트 결정
            if guidance_text is not None:
                header_text = guidance_text
                header_color = guidance_color
            else:
                if state == "NORMAL":
                    header_text = "Good posture"
                    header_color = (0, 255, 0)
                elif state == "CAUTION":
                    header_text = "Caution posture"
                    header_color = (0, 255, 255)
                else:
                    header_text = "Bad posture risk"
                    header_color = (0, 0, 255)

            level_text = f"LEVEL: {state}"
            score_text = f"Score: {raw_score} / Avg: {avg_score}"

            # ----------------------------
            # 화면 텍스트 출력
            # ----------------------------
            put(frame, header_text, 30, 35, header_color, 1.0, 3)
            put(frame, level_text, 30, 70, (255, 255, 255), 0.8, 2)
            put(frame, score_text, 30, 105, (255, 255, 255), 0.8, 2)

            if alert:
                put(frame, "BAD POSTURE ALERT", 30, 140, (0, 0, 255), 1.0, 3)

            y0 = 190
            dy = 32
            put(frame, f"HeadTilt: {d_head_tilt:.4f}", 30, y0)
            put(frame, f"ShoulderTilt: {d_shoulder_tilt:.4f}", 30, y0 + dy)
            put(frame, f"CenterOffset: {d_center_offset:.4f}", 30, y0 + dy * 2)
            put(frame, f"NoseForwardZ: {d_nose_forward:.4f}", 30, y0 + dy * 3)
            put(frame, f"EarForwardZ: {d_ear_forward:.4f}", 30, y0 + dy * 4)
            put(frame, f"NoseDrop: {d_nose_drop:.4f}", 30, y0 + dy * 5)
            put(frame, f"FaceShoulderRatio: {d_face_shoulder_ratio:.4f}", 30, y0 + dy * 6)
            put(frame, f"DistanceRatio: {distance_ratio:.3f}", 30, y0 + dy * 7)
            put(frame, f"Reasons: {', '.join(reasons) if reasons else 'stable'}", 30, y0 + dy * 8)
            put(frame, f"BAD Sustain: {bad_sustain:.1f}s", 30, y0 + dy * 9)

        # ----------------------------
        # 랜드마크 / 선 시각화
        # ----------------------------
        mp_drawing.draw_landmarks(frame, result.pose_landmarks, mp_pose.POSE_CONNECTIONS)

        pts = [
            (int(nose["x"] * w), int(nose["y"] * h), (0, 255, 0)),
            (int(ear_center["x"] * w), int(ear_center["y"] * h), (255, 255, 0)),
            (int(shoulder_center["x"] * w), int(shoulder_center["y"] * h), (255, 0, 0)),
            (int(mouth_center["x"] * w), int(mouth_center["y"] * h), (0, 200, 255)),
        ]

        for px, py, c in pts:
            cv2.circle(frame, (px, py), 6, c, -1)

        # 코-어깨 중심선
        cv2.line(
            frame,
            (int(nose["x"] * w), int(nose["y"] * h)),
            (int(shoulder_center["x"] * w), int(shoulder_center["y"] * h)),
            (0, 255, 255), 2
        )

        # 어깨선
        cv2.line(
            frame,
            (int(left_shoulder["x"] * w), int(left_shoulder["y"] * h)),
            (int(right_shoulder["x"] * w), int(right_shoulder["y"] * h)),
            (220, 220, 220), 2
        )

    else:
        put(frame, header_text, 30, 35, header_color, 1.0, 3)
        put(frame, level_text, 30, 70, (255, 255, 255), 0.8, 2)
        put(frame, score_text, 30, 105, (255, 255, 255), 0.8, 2)

    cv2.imshow("Front Posture Monitor", frame)

    key = cv2.waitKey(1) & 0xFF
    if key == 27 or key == ord("q"):
        break
    elif key == ord("r"):
        mode = "baseline"
        baseline_start_time = time.time()

        baseline_buffer = {k: [] for k in baseline_buffer}
        baseline = {}

        for k in history:
            history[k].clear()

        state = "NORMAL"
        bad_since = None
        caution_enter_count = 0
        bad_enter_count = 0
        normal_return_count = 0

        print("기준 자세 재측정 시작")

cap.release()
cv2.destroyAllWindows()
pose.close()
