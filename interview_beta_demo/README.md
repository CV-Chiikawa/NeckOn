# 모의면접 자세 분석 Beta

기존 거북목 프로그램을 변경하지 않고 실행하는 오프라인 Python 데모다. 머리 좌우 기울기, 어깨 균형, 상체 좌우 기울기, 반복 몸 흔들림을 분석한다. 모든 임계값은 **Beta용 초기 휴리스틱**이며 의학적 기준이나 검증된 면접 점수가 아니다.

## 빠른 실행

이 폴더(`/Users/yoni/Documents/Programming/SWproject/interview_beta_demo`)에서 실행한다.

```bash
cd /Users/yoni/Documents/Programming/SWproject/interview_beta_demo
../.venv/bin/python -m interview_beta --source 0 --mirror --jsonl interview.jsonl
```

USB 카메라는 `--source 1` 등으로 바꾼다. macOS에서 실행하는 터미널/IDE에 카메라 권한을 허용한다. `Q`/`ESC`는 종료, `R`은 상태와 흔들림 이력 초기화다. 기존 프로그램과 동시에 카메라를 열지 않는다.

영상 입력 / 창 없이 분석:

```bash
../.venv/bin/python -m interview_beta --source /absolute/path/interview.mp4 --jsonl video.jsonl
../.venv/bin/python -m interview_beta --source /absolute/path/interview.mp4 --headless --jsonl video.jsonl
../.venv/bin/python -m interview_beta --source 0 --max-frames 300 --jsonl camera.jsonl
../.venv/bin/python -m interview_beta --config config.example.json --source 0
```

영상 시간은 `프레임 번호 / FPS`다. FPS 메타데이터가 잘못되면 `--fps 30`처럼 지정한다. 카메라는 monotonic 경과 초를 사용한다. 파일은 EOF에서 종료하며, 카메라 읽기 실패는 오류로 반환한다. `--jsonl` 파일은 새 실행마다 덮어쓰므로 보관할 결과에는 다른 파일명을 쓴다. 프레임 결과는 JSONL에, 확정 이벤트는 stdout에 기록한다. 원본 카메라 영상은 저장하지 않는다.

## 의존성과 호환성

실제 확인 환경: Python 3.11.15, MediaPipe 0.10.14 (`mp.solutions.pose`), OpenCV 4.13.0, NumPy 2.4.4. 기존 `.venv`의 `pip check`는 오류가 없었다. 시스템 기본 Python은 3.14이므로 위의 **기존 Python 3.11 경로**로 실행한다.

별도 환경이 필요하면:

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m interview_beta --source 0 --mirror --jsonl interview.jsonl
```

`requirements.txt`는 확인한 환경의 버전을 고정한다. 깨끗한 새 환경에서의 재설치는 이번 검증 범위에 포함하지 않았다. `opencv-contrib-python`에 cv2가 포함되므로 새 환경에 `opencv-python`을 중복 설치하지 않는다. 최신 MediaPipe의 API와 혼용하지 않는다. 설치 이후에는 번들 full Pose 모델(`model_complexity=1`)을 사용하며 코드에서 인터넷·외부 API·SOLAR를 호출하지 않는다. 패키지/모델 파일이 온전한 설치가 필요하다.

macOS 샌드박스에서는 `NSOpenGLPixelFormat` / `kGpuService` 오류가 날 수 있다. 검증 중 동일 오류가 발생했고, 일반 실행 환경에서는 같은 영상 통합 테스트가 통과했다. protobuf deprecated 경고와 OpenCV 영상 백엔드 탐색 경고가 있었지만 추론과 영상 출력은 정상 종료했다.

## 기존 코드 분석과 재사용

현재 `computer-vision` 폴더에는 수업 실습 코드가 있고, 사용자가 지정한 `SWproject`에서 실제 자세 분석 소스를 찾았다. 두 폴더 모두 Git 저장소는 아니었다.

| 기존 파일 | 확인한 기능 / 이번 처리 |
|---|---|
| `front_posture_monitor.py` | 귀 높이, 어깨 높이, 코-어깨 중심 오프셋, baseline, smoothing, 프레임 수 상태 전이. import 시 카메라가 열려 직접 import하지 않음 |
| `side_posture_monitor_v1.py` | 측면 귀-어깨/CVA 계열 처리. 정면 면접의 실제 3D 측정으로 전용하지 않음 |
| `posture_monitor_project/main.py` | VideoCapture → BGR/RGB → Pose.process → 모니터 → overlay 흐름 활용 |
| `posture_monitor_project/front_monitor.py` | 좌우 귀/어깨, midpoint, 별도 monitor 객체 구조 활용. 이번에는 시간 기반 별도 판정 구현 |
| `posture_monitor_project/common_utils.py` | landmark visibility, 중심점, 표시 개념 활용. cv2/config 결합이 있어 계산을 독립 구현 |
| `posture_monitor_project/config.py` | 기존 임계값과 프레임 수 상태 전이 확인. 새 설정과 분리 |
| `mode_inference.py`, `posture_monitor_project/mode_inference.py` | 정면/측면 자동 추론 확인. 이번 Beta는 정면 고정, 불확실 시 평가 보류 |
| `SWproject/main.py` | 같은 폴더에 없는 config/front_monitor 등을 직접 import하는 구조 확인. 기존 실행 경로를 고치는 작업은 범위에서 제외 |

**직접 재사용한 기존 Python 모듈은 없다.** MediaPipe Pose/VideoCapture 처리 흐름과 귀·어깨·중심점 계산 방식을 재사용하고, 누락된 골반 기반 분석과 시간 로직을 독립 구현했다. 기존 13개 소스/설정/문서의 SHA-256을 저장했고 납품 후 일치 여부를 검사한다. 기존 거북목 GUI/웹캠 프로그램의 정상 동작 자체를 재시험하지는 않았다.

## 새 파일

- `interview_beta/__init__.py`: 외부에서 사용할 분석기/설정 export
- `interview_beta/config.py`: 휴리스틱 설정과 검증
- `interview_beta/features.py`: visibility/회전 게이트, 2D Feature, 시간창 기반 흔들림
- `interview_beta/temporal.py`: 관찰 시간 기반 상태·복구·cooldown
- `interview_beta/analyzer.py`: 네 항목 판정과 JSON 직렬화 가능한 반환값
- `interview_beta/__main__.py`: 웹캠/영상, Pose 추론, landmark/값/피드백 패널, JSONL
- `tests/test_beta.py`, `tests/test_demo.py`: 핵심 규칙과 실제 영상 입력 자동 테스트
- `config.example.json`, `requirements.txt`, `README.md`: 설정·환경·사용법
- `validation/`: 검증 결과와 기존 소스 해시. 실제 인물 샘플은 실행 필수 자원이 아님

## Feature 정의와 판정

MediaPipe x/y를 영상 너비/높이로 각각 복원한 뒤 계산하므로 가로세로 비율에 따른 각도 왜곡을 막는다. 귀·어깨·골반에 visibility ≥ 0.6, 영상 내부 좌표, 유한값을 요구한다. 부분 누락은 해당 항목만 보류한다. confidence는 필요한 landmark visibility의 최솟값이며 **자세가 맞을 확률은 아니다**.

| Feature | 값 / 기본 문제 조건 |
|---|---|
| `head_tilt` | 좌우 귀 선의 2D 영상 각도. 절댓값 ≥ 10도. 양수: 피검자 왼쪽 귀가 더 낮음 → 왼쪽 기울기 |
| `shoulder_alignment` | (오른쪽 어깨 y − 왼쪽 어깨 y) / 어깨너비. 절댓값 ≥ 0.08. 양수: 피검자 왼쪽 어깨 높음 |
| `torso_lean` | 골반 중심→어깨 중심 벡터와 영상 수직선의 각도. 절댓값 ≥ 10도. 양수: 원본 영상 오른쪽으로 기울기 |
| `body_sway` | 8초 시간창의 상체 중심 좌우 peak-to-peak / 어깨너비 중앙값. 최소 4초 관찰, 진폭 ≥ 0.22, 유의한 반전으로 계산한 완전 주기 ≥ 2 |

상체 중심은 어깨 중심과 골반 중심의 중간점이다. 흔들림은 시간 기반 EMA(0.2초)를 거쳐 작은 jitter를 줄이고, 0.08 어깨너비 이상의 반전만 센다. 단일 위치 변경은 주기가 없으므로 흔들림 경고가 되지 않는다. 어깨너비가 25% 이상 바뀌거나 검출이 끊기면 이력을 초기화한다. 흔들림 판정은 시간창 자체의 관찰 지연에 추가로 2/4초 상태 전이 지연이 있다. 초기 4초는 `warming_up`이다.

어깨/귀 깊이 차이와 투영 너비로 심한 회전·퇴화 구도를 보류한다. 이때 z는 회전 판정용 proxy일 뿐 실제 깊이/3D 각도가 아니다. 회전 판정도 완전하지 않다. 카메라를 수평으로 고정하고, 알려진 영상 기울기는 `camera_roll_deg`로 보정한다(원본 영상 x 오른쪽, y 아래쪽 기준 시계방향 양수). 임의의 몸 기울기를 카메라 기울기로 자동 보정하지 않는다.

상태는 항목별로 `NORMAL → CANDIDATE → CAUTION(2초) → WARNING(4초)`다. 연속으로 관찰된 이상 구간만 시간을 더한다. 주의/경고 후 정상 1초를 관찰하면 `RECOVERED`를 한 프레임 반환한 후 `NORMAL`로 돌아온다. 잠깐 정상으로 돌아온 시간은 이상 지속시간에 합산하지 않는다. 누락 또는 2.5초 초과 입력 간격은 연속성을 초기화하고, 복구 이벤트를 만들지 않는다. 재검출은 새 후보부터 시작한다.

동일 항목·동일 심각도 이벤트에는 10초 cooldown이 있다. UI 상태는 cooldown 중에도 갱신되지만 같은 이벤트 재통지만 억제한다. 주의에서 경고로 상승하는 이벤트와 복구 이벤트는 구분한다. 한 episode에서 같은 상태를 계속 출력해도 이벤트는 반복되지 않는다. 최근 이슈가 계속 반복되면 미세한 정상 구간을 사이에 둔 시간을 같은 episode의 관찰 이상 시간으로 집계하며, 정상 1초가 확인되면 새 episode로 분리한다.

`status`는 확정 이슈가 있으면 WARNING/CAUTION을 우선 표시한다. 누락은 별도의 `measurement_status`, 항목별 `measurable`/`available`로 함께 전달하므로 일부 평가 불가와 확인된 문제를 동시에 표현한다. 이슈가 없는데 네 항목 중 일부만 측정 가능하면 `LOW_CONFIDENCE`, 모두 불가면 `UNAVAILABLE`이다.

## Backend 입출력

```python
from interview_beta import InterviewAnalyzer, Config

analyzer = InterviewAnalyzer(Config())  # 사용자 세션/영상마다 하나씩 유지
# MediaPipe Pose.process 결과. 없으면 None 전달
landmarks = result.pose_landmarks.landmark if result.pose_landmarks else None
payload = analyzer.update(landmarks, (frame_width, frame_height), timestamp_seconds)
# json.dumps(payload, ensure_ascii=False, allow_nan=False)
```

입력 landmark는 MediaPipe 표준 33개 순서이고 각 항목의 x/y/z/visibility 속성을 읽는다. timestamp는 0 이상의 단조 증가 source seconds이며, 프레임마다 현재값을 전달한다. 이 분석기는 stateful하므로 여러 사람/세션이 공유하지 않는다. 단일 사람만 지원하며 사용자 식별/전환 감지는 없다.

출력 형태(축약):

```json
{
  "schema_version": "1.0",
  "mode": "interview",
  "timestamp": 4.2,
  "timestamp_unit": "source_seconds",
  "status": "WARNING",
  "measurement_status": "AVAILABLE",
  "features": {
    "head_tilt": {
      "value": 14.0,
      "unit": "image_degrees",
      "available": true,
      "confidence": 0.95,
      "reason": null,
      "direction": "subject_left"
    }
  },
  "items": {
    "head_tilt": {
      "state": "WARNING",
      "duration_seconds": 4.2,
      "recovered": false,
      "measurable": true,
      "feedback": "Keep your head upright."
    }
  },
  "visibility_confidence": {"head_tilt": 0.95},
  "active_posture_issues": ["head_tilt"],
  "generated_events": [
    {"type": "WARNING", "issue": "head_tilt", "timestamp": 4.2, "duration_seconds": 4.2}
  ],
  "recovered": false,
  "guidance": null,
  "rubric": null
}
```

실제 출력에는 네 평가 항목과 보조 Feature가 모두 포함된다. 측정 불가는 value=null, available=false, reason 문자열로 반환한다. `items`는 매 프레임 UI용이고 `generated_events`는 이번 프레임 새 확정 이벤트만 담는다. duration은 원본 영상의 관찰된 이상 초이며 회복 중에는 직전 이슈 시간을 보존한다. `rubric`은 후속 A/B 확장용 자리다. SOLAR/FastAPI는 연결하지 않았고 CV 모듈이 판정까지 완료한다.

## 검증과 직접 테스트

```bash
../.venv/bin/python -m unittest discover -s tests -v
```

최종 자동 테스트 결과와 미검증 항목은 `validation/REPORT.md`에 기록한다. CV 의존성이 없는 Python에서는 영상 통합 테스트 하나만 skip하고 순수 계산/상태/CLI 테스트를 실행한다.

카메라는 눈높이 부근에서 수평으로 고정하고, 정면에서 양 귀·양 어깨·양 골반이 프레임 안에 보이게 한다. 노트북 화면 각도를 조절하는 것만으로 골반이 잘리지 않으면 충분하지만, 어렵다면 뒤로 물러서거나 외장 카메라를 사용한다. 밝은 전면 조명, 가림 없는 복장을 권장한다. 상반신만 잘린 화상회의 구도에서는 골반이 추정되더라도 낮은 visibility 때문에 상체/흔들림 분석을 보류할 수 있다.

| 직접 확인할 상황 | 예상 동작 |
|---|---|
| 정면 정상 착석 5초 이상 | 흔들림 초기화가 끝난 뒤 NORMAL |
| 머리 좌/우로 10도 이상 기울여 유지 | CANDIDATE → 2초 CAUTION → 4초 WARNING, 방향 구분 |
| 한쪽 어깨를 들어 4초 유지 | shoulder_alignment 경고 |
| 골반을 두고 상체 좌/우 기울임 | torso_lean 경고 |
| 충분한 진폭으로 2회 이상 좌우 반복, 10~15초 유지 | body_sway 주의/경고 |
| 잠깐 움직인 뒤 정상으로 복귀 | 확정 이벤트 없음; 이미 경고였다면 정상 1초 후 복구 |
| 귀/어깨/골반 일부를 프레임 밖으로 이동 | 해당 항목 측정 보류, 누락 시간을 경고에 합산하지 않음 |

## 미구현과 한계

실제 웹캠에서 위 7개 행동의 정확도를 아직 검증하지 않았다. 테스트로 규칙 동작을 확인한 것과 사람의 실영상 분류 성능은 구분해야 한다. 별도 사용자 녹화 인터뷰 영상도 제공되지 않았다. 인물 검출 검증에 쓴 공식 사진은 요가 자세로, 정면 착석 검증용이 아니다.

전방 거북목/전후 상체 기울기/실제 3D 각도/의학적 진단/면접 점수는 제공하지 않는다. 정면 카메라의 회전·기울기·가림·깊이 오차, landmark jitter, 카메라 이동이 결과에 영향을 준다. 흔들림은 카메라 이동과 사람 이동을 확실히 구분하지 못한다. 고정 기준값이므로 체형/환경별 실측 튜닝이 필요하다. 루브릭 A/B, 성별 추정, SOLAR, FastAPI, 프런트엔드, DB/로그인은 미구현이다. UI는 OpenCV 기본 영문 글꼴을 사용한다.

기술 정의 참고: [MediaPipe 공식 Pose 문서](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/pose.md), [공식 Pose 테스트](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/pose_test.py). 검증 이미지는 공식 테스트가 사용하는 [pose.jpg](https://storage.googleapis.com/mediapipe-assets/pose.jpg)다. 실행 중에는 이 링크에 접근하지 않는다.
