# NeckOn AI

2026년 1학기 AIX 프로젝트 심화에서 개발한 NeckOn 자세 분석 모듈입니다. 이 저장소의 `AI` 브랜치에는 AI/CV 소스만 포함됩니다.

## 주요 기능

- MediaPipe 기반 실시간 자세 랜드마크 추출
- 카메라 시점을 `FRONT`, `SIDE_LEFT`, `SIDE_RIGHT`로 자동 판별
- 사용자별 기준 자세(baseline) 설정
- 자세 상태를 `GOOD`, `CAUTION`, `BAD`로 분류
- 프레임 스무딩과 상태 전이 규칙을 통한 경고 안정화
- FastAPI 래퍼를 통한 백엔드 연동

## 프로젝트 구조

```text
posture_monitor_ai/
  front_posture_monitor.py
  side_posture_monitor.py
  Finally/
    main.py
    api.py
    posture_engine.py
    requirements.txt
```

현재 통합 구현은 `posture_monitor_ai/Finally`에 있습니다.

## 로컬 실행

```bash
cd posture_monitor_ai/Finally
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

카메라 인덱스와 표시 설정은 `config.py`에서 조정할 수 있습니다. 실행 후 `q` 또는 `Esc`로 종료하고 `r`로 분석 상태를 초기화합니다.

## API 실행

`api.py`는 `/health`, `/process-frame`, `/reset-session` 엔드포인트를 제공합니다. API 실행 시 FastAPI, Uvicorn, `python-multipart`가 추가로 필요합니다.

```bash
pip install fastapi uvicorn python-multipart
uvicorn api:app --host 0.0.0.0 --port 8001
```

## 보안 및 저장소 정책

가상환경, Python 캐시, IDE 설정, 로그, 모델/데이터 산출물과 로컬 환경변수는 버전 관리에서 제외합니다.
