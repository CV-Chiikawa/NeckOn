import cv2
import mediapipe as mp
import time

from config import CAMERA_INDEX, DISPLAY_MIRRORED
from common_utils import put_text, draw_front_overlay, draw_side_three_point_overlay, get_side_points
from mode_inference import ModeInferencer
from front_monitor import FrontMonitor
from side_monitor import SideMonitor


def render_ui(frame, ui):
    put_text(frame, ui["header_text"], 30, 35, ui["header_color"], 1.0, 3)
    put_text(frame, ui["level_text"], 30, 70, (255, 255, 255), 0.8, 2)
    put_text(frame, ui["score_text"], 30, 105, (255, 255, 255), 0.8, 2)

    if ui.get("show_bad_alert", False):
        put_text(frame, "BAD POSTURE ALERT", 30, 140, (0, 0, 255), 1.0, 3)

    y0 = 190 if ui.get("show_bad_alert", False) else 165
    dy = 34
    for i, line in enumerate(ui.get("info_lines", [])):
        put_text(frame, line, 30, y0 + i * dy, (255, 255, 255), 0.75, 2)


def center_zoom(frame, zoom=1.0):
    """
    비율 유지 디지털 줌
    zoom=1.0 이면 원본
    zoom=1.18 이면 약 1.18배 확대
    """
    if zoom <= 1.0:
        return frame.copy()

    h, w = frame.shape[:2]
    new_w = int(w / zoom)
    new_h = int(h / zoom)

    x1 = (w - new_w) // 2
    y1 = (h - new_h) // 2
    x2 = x1 + new_w
    y2 = y1 + new_h

    cropped = frame[y1:y2, x1:x2]
    zoomed = cv2.resize(cropped, (w, h), interpolation=cv2.INTER_LINEAR)
    return zoomed


def draw_inference_preview(frame, landmarks, face_result, infer, mp_pose, mp_drawing, mp_face_detection):
    if landmarks is None:
        return

    preview_mode = infer.get("preview_mode", "FRONT")
    if preview_mode == "FRONT":
        draw_front_overlay(frame, landmarks, mp_pose, mp_drawing)
        return

    side_name = "LEFT" if preview_mode == "SIDE_LEFT" else "RIGHT"
    nose, ear, shoulder = get_side_points(landmarks, mp_pose, side_name, face_result, mp_face_detection)
    pack = {"nose": nose, "ear": ear, "shoulder": shoulder}
    draw_side_three_point_overlay(frame, pack)


def to_display_mode(mode_name, display_mirrored=True):
    if mode_name is None:
        return "pending"

    if mode_name == "FRONT":
        return "FRONT"

    if mode_name == "SIDE_LEFT":
        return "SIDE_RIGHT" if display_mirrored else "SIDE_LEFT"

    if mode_name == "SIDE_RIGHT":
        return "SIDE_LEFT" if display_mirrored else "SIDE_RIGHT"

    return mode_name


def get_camera_zoom(camera_index):
    """
    카메라별 줌 프로필
    0 = 내장캠(기본 배율)
    1 = 웹캠(디지털 줌 적용)

    필요하면 숫자만 바꿔서 튜닝하면 됨.
    """
    camera_profiles = {
        0: {"name": "internal", "zoom": 1.0},
        1: {"name": "webcam", "zoom": 1.5},
    }
    return camera_profiles.get(camera_index, {"name": "unknown", "zoom": 1.0})


def main():
    mp_pose = mp.solutions.pose
    mp_drawing = mp.solutions.drawing_utils
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

    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        print("카메라를 열 수 없습니다.")
        return

    cam_profile = get_camera_zoom(CAMERA_INDEX)
    digital_zoom = cam_profile["zoom"]
    use_digital_zoom = digital_zoom > 1.0

    print(f"카메라 인덱스: {CAMERA_INDEX}")
    print(f"카메라 프로필: {cam_profile['name']}")
    print(f"디지털 줌 배율: {digital_zoom}")

    inferencer = ModeInferencer(mp_pose, mp_face_detection)
    active_monitor = None
    phase = "infer"

    print("Unified posture monitor 시작")
    print("초기 2초 동안 카메라 위치를 자동 추론합니다.")
    print("q 또는 ESC : 종료")
    print("r : 전체 재시작")

    while True:
        ret, frame_raw = cap.read()
        if not ret:
            print("프레임을 읽을 수 없습니다.")
            break

        now = time.time()

        if use_digital_zoom:
            frame_input = center_zoom(frame_raw, zoom=digital_zoom)
        else:
            frame_input = frame_raw.copy()

        frame_draw = frame_input.copy()
        rgb = cv2.cvtColor(frame_input, cv2.COLOR_BGR2RGB)

        result = pose.process(rgb)
        face_result = face_detection.process(rgb)

        landmarks = result.pose_landmarks.landmark if result.pose_landmarks else None

        if phase == "infer":
            if landmarks is None:
                ui = {
                    "header_text": "DETECTING VIEW",
                    "header_color": (255, 255, 255),
                    "level_text": "LEVEL: GUIDE",
                    "score_text": "Score: -",
                    "info_lines": [
                        "ActiveMode: pending",
                        "ModeLock: pending",
                        "Show your face/body to the camera",
                        "OverlayMode: pending",
                        f"CameraProfile: {cam_profile['name']}",
                        f"Zoom: {digital_zoom:.2f}",
                        "Waiting for pose...",
                    ],
                    "show_bad_alert": False,
                }
            else:
                infer = inferencer.update(landmarks, face_result, now)
                draw_inference_preview(frame_draw, landmarks, face_result, infer, mp_pose, mp_drawing, mp_face_detection)

                if infer["locked_mode"] is not None:
                    if infer["locked_mode"] == "FRONT":
                        active_monitor = FrontMonitor(mp_pose, mp_drawing)
                    elif infer["locked_mode"] == "SIDE_LEFT":
                        active_monitor = SideMonitor(mp_pose, mp_face_detection, "LEFT")
                    else:
                        active_monitor = SideMonitor(mp_pose, mp_face_detection, "RIGHT")
                    phase = "monitor"

                ui = {
                    "header_text": "DETECTING VIEW",
                    "header_color": (255, 255, 255),
                    "level_text": "LEVEL: GUIDE",
                    "score_text": "Score: -",
                    "info_lines": [
                        f"ActiveMode: {to_display_mode(infer['locked_mode'], DISPLAY_MIRRORED)}",
                        f"PreviewMode: {to_display_mode(infer['preview_mode'], DISPLAY_MIRRORED)}",
                        f"OverlayMode: {'FRONT_FULL' if infer['preview_mode'] == 'FRONT' else 'SIDE_3POINT'}",
                        f"CameraProfile: {cam_profile['name']}",
                        f"Zoom: {digital_zoom:.2f}",
                        f"FrontConf: {infer['front_conf']:.3f}",
                        f"LeftSideConf: {infer['left_conf']:.3f}",
                        f"RightSideConf: {infer['right_conf']:.3f}",
                        "Please keep your usual camera placement",
                    ],
                    "show_bad_alert": False,
                }

        else:
            ui = active_monitor.update(frame_draw, landmarks, face_result, now)
            ui["info_lines"].insert(0, f"Zoom: {digital_zoom:.2f}")
            ui["info_lines"].insert(0, f"CameraProfile: {cam_profile['name']}")

        if DISPLAY_MIRRORED:
            frame_show = cv2.flip(frame_draw, 1)
        else:
            frame_show = frame_draw

        render_ui(frame_show, ui)
        cv2.imshow("Unified Posture Monitor", frame_show)

        key = cv2.waitKey(1) & 0xFF
        if key == 27 or key == ord("q"):
            break
        elif key == ord("r"):
            inferencer.reset()
            active_monitor = None
            phase = "infer"
            print("전체 재시작")

    cap.release()
    cv2.destroyAllWindows()
    pose.close()
    face_detection.close()


if __name__ == "__main__":
    main()
