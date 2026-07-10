# Sense Posture System 백엔드

웹캠 기반 자세 모니터링, 대시보드 집계, Firebase Cloud Messaging 알림을 위한 `Node.js + Express + SQLite` 백엔드입니다.

지원 기능:

- JWT 기반 회원 인증
- 프로필 이미지 업로드를 포함한 회원정보 관리
- 기준 자세 landmark 저장
- MediaPipe landmark 좌표 기반 자세 분석
- CV 자세 상태 heartbeat 처리
- 일간/주간 대시보드 집계
- FCM 기기 등록 및 푸시 발송
- Nodemailer 기반 문의하기 메일 발송

## 기술 스택

- Node.js 22
- Express 5
- SQLite3
- JWT (`jsonwebtoken`)
- bcrypt
- multer
- Firebase Admin SDK
- Nodemailer

## 현재 자세 처리 흐름

프로젝트에는 자세 관련 흐름이 두 가지 있습니다.

### 1. Landmark 기준 자세 저장 및 분석

- `POST /landmark`
  - 사용자의 기준 자세 landmark와 파생 feature를 저장합니다.
  - 기준 자세는 사용자별로 1개 유지됩니다.
- `POST /posture/analyze`
  - raw landmark 좌표를 받습니다.
  - 백엔드에서 자세 feature를 계산합니다.
  - 결과로 `normal`, `warning`, `danger`를 반환합니다.

### 2. CV 상태 heartbeat 처리

- `POST /posture/heartbeat`
  - CV가 상태값만 보냅니다: `good`, `caution`, `bad`
  - 백엔드가 사용자별 현재 상태 지속 시간을 계산합니다.
  - 상태가 바뀌면 이전 구간을 `PostureLogs`에 저장합니다.
  - `bad`가 5초 이상 유지되면 알림과 푸시를 한 번 보냅니다.

내부 상태 매핑:

- `good -> normal`
- `caution -> warning`
- `bad -> danger`

즉:

- 대시보드는 `PostureLogs`를 집계합니다.
- 실시간 heartbeat 상태는 `PostureHeartbeatState`에서 관리합니다.
- 프론트엔드는 집계된 데이터를 표시하는 데 집중하면 됩니다.

## 프로젝트 구조

```text
app.js
src/
  app.js
  config/
  controllers/
  middleware/
  routes/
  services/
  utils/
public/
test/
scripts/
```

주요 진입점:

- `app.js`: 서버 실행
- `src/app.js`: Express 앱 설정과 라우트 등록
- `src/config/db.js`: SQLite 초기화

## 환경변수

`.env` 파일을 만들어 설정합니다.

최소 필요 값:

```env
PORT=3000
JWT_SECRET=change-me
DATABASE_PATH=./database.sqlite
POSTURE_LOG_RETENTION_DAYS=90
AI_POSTURE_ENABLED=false
AI_POSTURE_API_URL=http://127.0.0.1:8001
AI_POSTURE_TIMEOUT_MS=2500
WARNING_ALERT_MIN_DURATION_SECONDS=30
DANGER_ALERT_MIN_DURATION_SECONDS=5
BAD_ALERT_MIN_DURATION_SECONDS=5
```

Firebase 푸시를 쓰려면 아래 중 하나가 필요합니다.

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"your-project-id", "...":"..."}
```

또는 프로젝트 루트에 `serviceAccountKey.json` 파일을 둡니다.

문의하기 메일을 쓰려면 아래 환경변수가 필요합니다.

```env
CONTACT_MAIL_TO=support@example.com
MAIL_FROM=noreply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=smtp-user
SMTP_PASS=smtp-password
```

설명:

- `JWT_SECRET`: 서버 시작에 필요합니다.
- `DATABASE_PATH`: SQLite DB 파일 위치입니다.
- `POSTURE_LOG_RETENTION_DAYS`: 서버 시작 시 오래된 `PostureLogs` 삭제 기준입니다. `0`이면 자동 삭제를 끕니다.
- `AI_POSTURE_ENABLED=true`: `/posture/analyze`에서 외부 Python 자세 분석 서비스를 먼저 호출합니다.
- `CONTACT_MAIL_TO`: 문의 메일을 받을 운영자 이메일입니다.
- 실제 비밀값과 `serviceAccountKey.json`은 커밋하지 마세요.

## 설치 및 실행

의존성 설치:

```bash
npm install
```

서버 실행:

```bash
npm start
```

테스트 실행:

```bash
npm test
```

상태 확인:

```text
GET /health
```

## 선택 사항: AI 자세 분석 서비스

팀원 AI 코드 기본 위치:

```text
../AIX_AI/posture_monitor_ai/Finally
```

AI 저장소 위치가 다르면 아래 환경변수를 설정합니다.

```env
AI_POSTURE_CODE_PATH=C:\path\to\AIX_AI\posture_monitor_ai\Finally
```

Python HTTP wrapper 의존성 설치:

```bash
py -3.11 -m pip install -r scripts/ai_posture_requirements.txt
```

백엔드 프로젝트 루트에서 AI HTTP wrapper 실행:

```bash
py -3.11 scripts/ai_posture_server.py
```

Node 백엔드에서 AI 사용 설정:

```env
AI_POSTURE_ENABLED=true
AI_POSTURE_API_URL=http://127.0.0.1:8001
```

AI wrapper 제공 API:

- `GET /health`
- `POST /process-frame`
- `POST /reset-session`

`/posture/analyze`는 `frame_data_url`을 `/process-frame`에 보내고 AI 상태를 아래처럼 변환합니다.

- `GOOD -> normal`
- `CAUTION -> warning`
- `BAD -> danger`

AI가 `GUIDE`를 반환하거나, timeout 또는 오류가 발생하면 기존 rule 기반 자세 분석 결과를 사용합니다.

## 데이터베이스 개요

주요 테이블:

- `Users`
- `LandMark`
- `Notifications`
- `UserDevices`
- `PostureLogs`
- `PostureHeartbeatState`

### `LandMark`

기준 자세 landmark 좌표와 파생 feature를 저장합니다.

- `forward_distance`
- `nose_shoulder_distance`
- `head_angle`
- `shoulder_width`
- `min_visibility`
- `avg_visibility`

### `PostureLogs`

집계 가능한 자세 구간을 저장합니다.

- `status`
- `duration_seconds`
- `created_at`

대시보드 API는 이 테이블을 기준으로 집계합니다.
`POSTURE_LOG_RETENTION_DAYS`보다 오래된 행은 DB 초기화 시 삭제됩니다.

### `PostureHeartbeatState`

사용자별 현재 heartbeat 상태를 저장합니다.

- `current_status`
- `started_at`
- `last_seen_at`
- `alert_sent`

CV가 상태값만 보내는 연동 방식에서 사용됩니다.

## API 요약

보호 API는 모두 아래 헤더가 필요합니다.

```text
Authorization: Bearer <token>
```

### 인증

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

### 사용자

- `GET /users/me`
- `PATCH /users/me`

프로필 이미지는 `multer`로 업로드하며, DB에는 서버 파일 경로만 저장합니다.

### 문의하기

- `POST /contacts`

### Landmark와 자세

- `POST /landmark`
- `GET /landmark/latest`
- `POST /posture/analyze`
- `POST /posture/heartbeat`
- `POST /posture/log`

### 대시보드

- `GET /dashboard/today`
- `GET /dashboard/weekly`

### 알림과 기기

- `GET /notifications`
- `POST /devices/register`
- `GET /devices`
- `DELETE /devices`
- `POST /push/send`

자세한 요청/응답 예시는 아래 문서를 참고하세요.

- [API_LIST.md](./API_LIST.md)
- [FRONTEND_API_GUIDE.md](./FRONTEND_API_GUIDE.md)

## Heartbeat API 계약

CV는 자세 상태값만 보내면 됩니다.

요청:

```json
{
  "status": "bad"
}
```

허용값:

- `good`
- `caution`
- `bad`

백엔드 동작:

1. 첫 heartbeat가 오면 상태 추적을 시작합니다.
2. 같은 상태가 유지되면 같은 구간의 지속 시간을 갱신합니다.
3. 상태가 바뀌면 이전 구간을 `PostureLogs`에 저장합니다.
4. `bad`가 5초 이상 유지되면 알림을 한 번 보냅니다.

이 흐름은 CV가 먼저 자세 상태를 판단하고, 백엔드가 지속 시간을 계산하는 방식입니다.

## Landmark 요청 형태

Raw landmark 분석을 사용할 때 백엔드는 아래와 비슷한 중첩 객체를 기대합니다.

```json
{
  "landmarks": {
    "nose": { "x": 0.50, "y": 0.20, "z": -0.01, "visibility": 0.95 },
    "left_ear": { "x": 0.46, "y": 0.22, "z": -0.01, "visibility": 0.31 },
    "right_ear": { "x": 0.64, "y": 0.26, "z": -0.04, "visibility": 0.96 },
    "left_shoulder": { "x": 0.44, "y": 0.41, "z": 0.01, "visibility": 0.35 },
    "right_shoulder": { "x": 0.56, "y": 0.41, "z": 0.02, "visibility": 0.97 },
    "nose_tip": { "x": 0.53, "y": 0.21, "z": -0.02, "visibility": 0.99 }
  }
}
```

최소 필수 landmark:

- `nose`
- `left_ear`
- `right_ear`
- `left_shoulder`
- `right_shoulder`

## 대시보드 데이터 출처

`/dashboard/today`, `/dashboard/weekly`는 `PostureLogs`를 집계합니다.

중요:

- `PostureLogs`가 비어 있으면 대시보드 값은 `0`입니다.
- 주간 그래프는 raw landmark가 아니라 저장된 자세 구간 로그를 기준으로 합니다.

샘플 파일:

- [sample_weekly_posture_logs.json](./sample_weekly_posture_logs.json)

## 프론트엔드 / 원격 테스트

로컬 테스트 주소:

- `http://localhost:3000`

원격 프론트 팀원이 접근해야 하면 `ngrok` 같은 터널을 사용합니다.

예시:

```bash
ngrok http 3000
```

ngrok의 `Forwarding` URL을 API base URL로 사용합니다.

사용하면 안 되는 주소:

```text
http://127.0.0.1:4040
```

이 주소는 ngrok 로컬 inspection 화면입니다.

## 관련 문서

- [FRONTEND_API_GUIDE.md](./FRONTEND_API_GUIDE.md)
- [AI_HANDOFF.md](./AI_HANDOFF.md)
- [FRONTEND_HANDOFF.md](./FRONTEND_HANDOFF.md)
- [API_LIST.md](./API_LIST.md)
- [NGROK_DEPLOY.md](./NGROK_DEPLOY.md)

## 참고 사항

- SQLite 스키마 업데이트는 누락된 컬럼을 자동 추가하지만 기존 테이블 전체를 새로 만들지는 않습니다.
- `LandMark`, `PostureLogs`는 사용자/시간 기준 조회를 위해 인덱스가 있습니다.
- 푸시 알림은 인증된 사용자에게 등록된 기기로만 전송됩니다.
- 런타임에서는 Firebase 인증 정보가 필요합니다.
- 테스트에서는 더미 Firebase service account를 주입합니다.
