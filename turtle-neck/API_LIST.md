# API 목록

백엔드에서 제공하는 API 전체 목록입니다.
프론트 화면 연결만 필요하면 [FRONTEND_API_GUIDE.md](./FRONTEND_API_GUIDE.md)를 먼저 확인하세요.

## 기본 정보

- Base URL: `http://localhost:3000`
- 인증 방식: JWT Bearer token
- 보호 API는 아래 헤더가 필요합니다.

```http
Authorization: Bearer <jwt>
```

## Auth

### 회원가입

`POST /auth/register`

- 인증: 필요 없음
- 요청 형식: `multipart/form-data`

필드:

- `username`: 필수
- `email`: 필수
- `password`: 필수, 최소 6자
- `nickname`: 선택
- `profile_image`: 선택 이미지 파일
- `snapshot_consent`: 선택, `"true"` 또는 `"false"`

요청 예시:

```http
POST /auth/register
Content-Type: multipart/form-data
```

응답 예시 `201`:

```json
{
  "message": "User registered successfully.",
  "user": {
    "id": 1,
    "username": "tester",
    "email": "tester@example.com",
    "nickname": "Tester",
    "profile_image": "/uploads/profiles/profile_123.png"
  },
  "token": "<jwt>"
}
```

### 로그인

`POST /auth/login`

- 인증: 필요 없음
- 요청 형식: `application/json`

요청:

```json
{
  "email": "tester@example.com",
  "password": "password-123"
}
```

응답 예시 `200`:

```json
{
  "message": "Login successful.",
  "token": "<jwt>",
  "user": {
    "id": 1,
    "username": "tester",
    "email": "tester@example.com"
  }
}
```

### 내 인증 정보 확인

`GET /auth/me`

- 인증: 필요
- 토큰에 들어 있는 사용자 정보를 반환합니다.

응답 예시:

```json
{
  "message": "Authentication successful.",
  "user": {
    "id": 1,
    "username": "tester",
    "email": "tester@example.com"
  }
}
```

## Users

### 내 프로필 조회

`GET /users/me`

- 인증: 필요
- 현재 로그인한 사용자의 프로필을 반환합니다.

### 내 프로필 수정

`PATCH /users/me`

- 인증: 필요
- 닉네임/비밀번호만 수정: `application/json`
- 프로필 이미지 포함 수정: `multipart/form-data`

필드:

- `nickname`: 선택
- `password`: 선택, 최소 6자
- `profile_image`: 선택 이미지 파일
- `snapshot_consent`: 선택, `"true"` 또는 `"false"`

응답 예시:

```json
{
  "message": "User profile updated successfully.",
  "data": {
    "id": 1,
    "username": "tester",
    "email": "tester@example.com",
    "nickname": "Updated Tester",
    "profile_image": "/uploads/profiles/profile_123.png",
    "created_at": "2026-04-16 12:00:00",
    "updated_at": "2026-04-16 12:30:00"
  }
}
```

## Snapshots

### 스냅샷 목록 조회

`GET /snapshots`

- 인증: 필요

### 스냅샷 업로드

`POST /snapshots`

- 인증: 필요
- 요청 형식: `multipart/form-data`
- `snapshot_image`: 필수 이미지 파일
- 스냅샷 저장 동의가 `true`인 사용자만 업로드 가능

### 스냅샷 일괄 삭제

`DELETE /snapshots`

- 인증: 필요
- 요청 본문:

```json
{
  "ids": [1, 2, 3]
}
```

## Contact

### 문의하기

`POST /contacts`

- 인증: 필요
- 문의 메일을 운영자 메일함으로 발송합니다.
- 메일의 `replyTo`는 로그인 사용자의 가입 이메일로 설정됩니다.
- 텍스트만 보낼 때: `application/json`
- 첨부파일이 있을 때: `multipart/form-data`

메일 환경변수:

- `CONTACT_MAIL_TO`: 문의를 받을 운영자 이메일, 필수
- `MAIL_FROM`: 발신자 이메일. 없으면 `SMTP_USER` 또는 `MAIL_USER` 사용
- `SMTP_HOST` 또는 `MAIL_HOST`: SMTP host
- `SMTP_PORT` 또는 `MAIL_PORT`: 기본값 `587`
- `SMTP_SECURE` 또는 `MAIL_SECURE`: 보안 연결 여부
- `SMTP_USER` 또는 `MAIL_USER`: SMTP 사용자명
- `SMTP_PASS` 또는 `MAIL_PASS`: SMTP 비밀번호

필드:

- `category`: 필수. `bug_report | feature_request | other`
- `content`: 필수. 최대 5000자
- `attachments`: 선택. 최대 5개

허용 첨부 확장자:

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`
- `.pdf`
- `.txt`

JSON 요청:

```json
{
  "category": "bug_report",
  "content": "The posture chart does not refresh."
}
```

파일 포함 요청:

```http
category=feature_request
content=Please add a weekly export feature.
attachments=<file>
attachments=<file>
```

응답 예시:

```json
{
  "message": "Contact inquiry sent successfully.",
  "data": {
    "category": "bug_report",
    "reply_email": "tester@example.com",
    "attachment_count": 0,
    "message_id": "<nodemailer-message-id>"
  }
}
```

## Landmark

### 기준 자세 저장

`POST /landmark`

- 인증: 필요
- 요청 형식: `application/json`
- 사용자의 기준 자세 landmark와 파생 자세 feature를 저장하거나 교체합니다.
- 좌표는 정규화된 좌표를 사용합니다.

요청 예시:

```json
{
  "reference_side": "right",
  "landmarks": {
    "nose": { "x": 0.5, "y": 0.2, "z": -0.01, "visibility": 0.97 },
    "nose_tip": { "x": 0.53, "y": 0.21, "z": -0.02, "visibility": 0.99 },
    "left_ear": { "x": 0.46, "y": 0.22, "z": -0.01, "visibility": 0.45 },
    "right_ear": { "x": 0.64, "y": 0.26, "z": -0.04, "visibility": 0.96 },
    "left_shoulder": { "x": 0.44, "y": 0.41, "z": 0.01, "visibility": 0.42 },
    "right_shoulder": { "x": 0.56, "y": 0.41, "z": 0.02, "visibility": 0.97 }
  }
}
```

참고:

- `nose_tip`이 있으면 우선 사용합니다.
- `nose_tip`이 없으면 pose `nose`를 사용합니다.
- `reference_side`는 `left` 또는 `right`입니다.
- 힌트가 없으면 백엔드가 visibility 기준으로 더 안정적인 쪽을 선택할 수 있습니다.

### 최신 기준 자세 조회

`GET /landmark/latest`

- 인증: 필요
- 현재 사용자의 최신 기준 자세 landmark를 반환합니다.

## Posture Analyze

### 자세 분석

`POST /posture/analyze`

- 인증: 필요
- 요청 형식: `application/json`
- `POST /landmark`와 같은 landmark 요청 형태를 사용합니다.
- 최신 기준 자세와 현재 자세를 비교합니다.
- `AI_POSTURE_ENABLED=true`이고 `frame_data_url`이 있으면 외부 AI 자세 분석 서비스를 먼저 호출합니다.
- AI 호출 실패 시 rule 기반 분석 결과를 사용합니다.

현재 rule:

- `head_angle <= 55`: `warning`
- `head_angle <= 50`: `danger`

응답 예시:

```json
{
  "message": "Posture analyzed successfully.",
  "data": {
    "source": "external-ai",
    "status": "danger",
    "rule_status": "warning",
    "ai": {
      "mode": "FRONT",
      "state": "BAD",
      "status": "danger",
      "message": "Bad posture risk"
    },
    "current": {
      "head_angle": 48.3
    },
    "baseline": {
      "forward_distance": 0,
      "nose_shoulder_distance": 0,
      "head_angle": 87.1
    },
    "diff": {
      "forward_distance_diff": 0.18,
      "nose_shoulder_distance_diff": 0.1,
      "head_angle_diff": -38.8
    },
    "thresholds": {
      "warning_head_angle_max": 55,
      "danger_head_angle_max": 50
    },
    "angle_assessment": {
      "current_head_angle": 48.3,
      "baseline_head_angle": 87.1
    }
  }
}
```

### AI 기준 세션 리셋

`POST /posture/baseline`

- 인증: 필요
- 요청 형식: `application/json`
- 인증된 사용자의 외부 AI 자세 세션/기준값을 리셋합니다.
- AI 서비스가 꺼져 있어도 안전하게 호출할 수 있습니다.

요청:

```json
{
  "frame_data_url": "data:image/jpeg;base64,..."
}
```

응답:

```json
{
  "message": "AI posture session reset successfully.",
  "data": {
    "enabled": true,
    "reset": true,
    "session_id": "1"
  }
}
```

## Posture Heartbeat

### 자세 상태 heartbeat

`POST /posture/heartbeat`

- 인증: 필요
- 요청 형식: `application/json`
- CV가 자세 상태만 보내고, 백엔드가 지속 시간을 계산합니다.

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

- 현재 상태를 사용자별로 `PostureHeartbeatState`에 저장합니다.
- 상태가 바뀌면 이전 구간을 `PostureLogs`에 저장합니다.
- 내부 매핑:
  - `good -> normal`
  - `caution -> warning`
  - `bad -> danger`
- `bad`가 5초 이상 지속되면 알림과 푸시를 한 번 보냅니다.

응답 예시:

```json
{
  "message": "Heartbeat processed.",
  "data": {
    "status": "bad",
    "previous_segment": null,
    "current_duration_seconds": 5,
    "alert": {
      "triggered": true,
      "threshold_seconds": 5,
      "notification_id": 10
    }
  }
}
```

## Posture Log

### 자세 로그 직접 저장

`POST /posture/log`

- 인증: 필요
- 요청 형식: `application/json`
- 분석이 끝난 자세 사용 구간을 직접 저장할 때 사용합니다.

요청:

```json
{
  "status": "warning",
  "duration_seconds": 12,
  "recorded_at": "2026-04-16T12:30:00Z"
}
```

필드:

- `status`: `normal | warning | danger`
- `duration_seconds`: 0 이상 숫자
- `recorded_at`: 선택 ISO datetime 문자열

## Dashboard

### 오늘 대시보드

`GET /dashboard/today`

- 인증: 필요
- `PostureLogs`를 기준으로 오늘 요약을 반환합니다.

응답:

```json
{
  "message": "Today dashboard fetched successfully.",
  "data": {
    "total_usage_seconds": 900,
    "total_usage_minutes": 15,
    "normal_seconds": 600,
    "warning_seconds": 120,
    "danger_seconds": 180,
    "danger_count": 1,
    "good_posture_rate": 66.67
  }
}
```

### 주간 대시보드

`GET /dashboard/weekly`

- 인증: 필요
- `PostureLogs`를 기준으로 최근 7일 차트 데이터를 반환합니다.

응답:

```json
{
  "message": "Weekly dashboard fetched successfully.",
  "data": {
    "summary": {
      "total_usage_seconds": 600,
      "total_usage_minutes": 10,
      "normal_seconds": 300,
      "warning_seconds": 180,
      "danger_seconds": 120,
      "danger_count": 1,
      "good_posture_rate": 50
    },
    "chart": [
      {
        "date": "2026-04-16",
        "day_label": "Thu",
        "total_usage_seconds": 180,
        "total_usage_minutes": 3,
        "normal_seconds": 0,
        "warning_seconds": 180,
        "danger_seconds": 0,
        "danger_count": 0,
        "good_posture_rate": 0
      }
    ],
    "peak_usage_day": {
      "date": "2026-04-14",
      "day_label": "Tue",
      "total_usage_seconds": 300,
      "total_usage_minutes": 5
    }
  }
}
```

## Notifications

### 알림 생성

`POST /notifications`

- 인증: 필요
- 요청 형식: `application/json`
- 테스트 또는 내부 알림 생성용입니다.

요청:

```json
{
  "status": "warning",
  "message": "Please fix your posture."
}
```

### 알림 목록 조회

`GET /notifications`

- 인증: 필요
- 현재 사용자의 알림 목록을 최신순으로 반환합니다.

## Devices

### FCM 기기 등록

`POST /devices/register`

- 인증: 필요
- 요청 형식: `application/json`
- FCM 기기 토큰을 저장하거나 갱신합니다.

요청:

```json
{
  "device_type": "web",
  "fcm_token": "token-123"
}
```

허용 `device_type`:

- `web`
- `android`
- `ios`

### 등록된 기기 조회

`GET /devices`

- 인증: 필요
- 현재 사용자에게 등록된 기기 목록을 반환합니다.

### FCM 기기 삭제

`DELETE /devices`

- 인증: 필요
- 요청 형식: `application/json`

요청:

```json
{
  "fcm_token": "token-123"
}
```

## Push

### 푸시 전송

`POST /push/send`

- 인증: 필요
- 요청 형식: `application/json`
- 대상 사용자의 등록된 모든 기기로 푸시를 보냅니다.
- 현재 구현은 본인 기기로만 보낼 수 있습니다.

요청:

```json
{
  "user_id": 1,
  "title": "Test push",
  "body": "Body text"
}
```

응답 예시:

```json
{
  "message": "Push notification sent successfully.",
  "successCount": 1,
  "failureCount": 0
}
```

## AI Proxy

### AI 서버 상태 확인

`GET /ai/health`

- 인증: 없음
- `AI_BASE_URL`에 설정된 AI 서버의 `/health`로 요청을 전달합니다.

### AI 프레임 처리

`POST /ai/process-frame`

- 인증: 없음
- 요청 형식: `multipart/form-data`
- 필드:
  - `file`: 이미지 파일, 필수
  - `session_id`: 선택

### AI 세션 리셋

`POST /ai/reset-session`

- 인증: 없음
- 요청 형식: `multipart/form-data`
- 필드:
  - `session_id`: 필수

## Route Summary

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /users/me`
- `PATCH /users/me`
- `POST /contacts`
- `POST /landmark`
- `GET /landmark/latest`
- `POST /posture/analyze`
- `POST /posture/baseline`
- `POST /posture/heartbeat`
- `POST /posture/log`
- `GET /dashboard/today`
- `GET /dashboard/weekly`
- `POST /notifications`
- `GET /notifications`
- `POST /devices/register`
- `GET /devices`
- `DELETE /devices`
- `POST /push/send`
- `GET /ai/health`
- `POST /ai/process-frame`
- `POST /ai/reset-session`
