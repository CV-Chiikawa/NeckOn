# 검증 기록 — 2026-10-27 (Asia/Seoul)

## 확인한 항목

- Python 3.11.15 / MediaPipe 0.10.14 / OpenCV 4.13.0 / NumPy 2.4.4.
- 기존 가상환경 `python -m pip check`: No broken requirements found.
- 최종 unittest: 27개 전체 통과(실제 영상 입력 통합 테스트 포함), skip 없음. 실행 명령과 원문은 `test_results.txt`.
- 순수 Python 테스트 24개: 정상, 양쪽 머리 기울기, 어깨/상체, aspect ratio 보정, 회전/visibility/좌표 누락, 카메라 roll 설정, 반복 흔들림/한 번 이동/jitter, 후보/주의/경고/복구, cooldown 만료, 누락/시간 역행, 짧은 정상 구간 시간 제외, 복구 직후 새 episode.
- CLI 3개: --help, 없는 영상의 오류 종료, 실제 OpenCV 생성 6프레임 검은 영상 → MediaPipe 추론 → 6개 JSONL UNAVAILABLE 결과, 경고 이벤트 없음, 끝 timestamp 0.5초.
- 공식 MediaPipe `pose.jpg`에서 실제 33개 Landmark 추출 성공. `real_pose.json`, `real_pose_overlay.jpg`에 결과. 이 사진은 머리와 몸을 돌린 요가 자세라 회전 게이트로 평가를 보류했다. 정면 착석 정확도 근거는 아니다.
- 공식 사진을 반복한 50프레임 AVI를 실제 CLI로 처리해 `person_video.jsonl` 50개 행 생성. timestamp 0.0~4.9초 확인. 실제 사람의 움직임을 담은 영상은 아니다.
- `synthetic_sequence.jsonl`은 합성 Landmark의 정상→머리 기울기→복구→누락 결과 예시다. 실제 카메라 측정으로 해석하지 않는다.
- 오버레이 결과 파일을 직접 시각 확인: Landmark, 네 항목 상태, 구도 안내가 표시됨. 여러 이슈 때 글씨가 잘리지 않도록 패널 최소 높이를 확장했다.
- 기존 소스 13개 SHA-256 일치 확인은 최종 설치 후 수행하며 `preservation.txt`에 결과 기록.

## 환경에 따른 최초 실패와 해결

샌드박스 내 실제 MediaPipe 통합 테스트는 `NSOpenGLPixelFormat` / `kGpuService` 초기화 실패였다. 같은 테스트를 샌드박스 밖에서 재실행해 통과했다. 라이브러리의 protobuf deprecated 및 OpenCV 백엔드 탐색 경고가 관찰됐으나 추론 결과/종료 코드는 정상이다. 테스트 과정에서 발견한 정상 시간 합산 및 episode 간 duration 잔류는 실패하는 회귀 테스트를 추가한 뒤 수정하고 재검증했다.

## 아직 확인하지 않은 항목

- 실제 내장/USB 웹캠 접근 및 macOS 카메라 권한.
- 웹캠 GUI 창을 띄워 키보드 조작/미러링/실시간 FPS를 확인하는 테스트.
- 사람의 정상 정면 착석과 의도적인 네 가지 문제 자세의 실영상 정확도.
- 실제 녹화 인터뷰 영상의 분류 성능과 체형별 임계값 튜닝.
- 기존 거북목 프로그램의 런타임 회귀 테스트(원본 파일 보존만 검증).
- 새 가상환경에서 requirements 전체 재설치, 다른 OS/CPU 및 Python 버전.

따라서 **독립 실행 코드, 규칙 테스트, 실제 MediaPipe 추론 및 영상/JSON 경로는 검증됨**. 실제 면접 웹캠의 자세 구분 품질은 README의 7개 수동 시나리오를 수행해 확인해야 한다.
