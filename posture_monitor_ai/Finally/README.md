# 전면 및 측면 통합 자세 모니터링 AI
Front + Side posture monitor with automatic mode inference.
:  전면 및 측면 자세를 자동으로 추론하는 모니터링 시스템

## Files
- `main.py` : 실행 진입점
- `config.py` : 상수/임계값
- `common_utils.py` : 공통 유틸
- `mode_inference.py` : FRONT / SIDE_LEFT / SIDE_RIGHT 자동 판정
- `front_monitor.py` : front 전용 baseline + 상태 전이
- `side_monitor.py` : side 전용 baseline + 상태 전이
- `requirements.txt` : 패키지 목록

## Run
```bash
pip install -r requirements.txt
python main.py
```

## Flow
1. 시작 후 약 2초 동안 카메라 위치 자동 추론
2. `FRONT` 또는 `SIDE_LEFT / SIDE_RIGHT` 로 lock
3. 해당 모드에서 baseline 저장
4. 이후 `GOOD / CAUTION / BAD / GUIDE` 상태 모니터링

## Notes
- `r`: 전체 재시작
- `q` 또는 `ESC`: 종료


## Overlay behavior
- FRONT mode: 전체 포즈 기준점 + 정면 가이드 포인트
- SIDE_LEFT / SIDE_RIGHT mode: 측면 점수 계산에는 3점(코, 고정된 쪽 귀, 고정된 쪽 어깨)만 사용
- 자동 추론 과정에서 미리보기 오버레이는 가장 유력한 후보 모드를 따름
