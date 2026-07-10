# NeckOn 프론트엔드 API 연동 문서

프론트엔드 개발자가 앱 화면을 연결할 때 필요한 API만 정리한 문서입니다.

## 1. 공통 규칙

- 기본 주소: `http://localhost:3000`
- 로그인 이후 API는 JWT 토큰이 필요합니다.
- 보호 API 호출 시 아래 헤더를 넣어주세요.

```http
Authorization: Bearer <jwt>
```

- JSON 요청은 아래 헤더를 사용합니다.

```http
Content-Type: application/json
```

## 2. 화면별 API 요약

| 앱 화면/기능 | 호출 API | 사용 목적 |
| --- | --- | --- |
| 회원가입 | `POST /auth/register` | 이메일, 비밀번호, 닉네임 가입 |
| 로그인 | `POST /auth/login` | 로그인 및 JWT 토큰 발급 |
| 내 정보 불러오기 | `GET /users/me` | 마이페이지, 회원정보 수정 화면 초기값 |
| 오늘의 총 이용시간 | `GET /dashboard/today` | 오늘 누적 사용 시간 표시 |
| 거북목 감지 횟수 | `GET /dashboard/today` | 오늘 위험 자세 감지 횟수 표시 |
| 바른 자세 유지율 파이차트 | `GET /dashboard/today` | 정상/주의/위험 자세 비율 표시 |
| 주간 그래프 | `GET /dashboard/weekly` | 최근 7일 사용 시간 또는 자세 유지율 그래프 |
| 알림 내역 | `GET /notifications` | 알림 목록 표시 |
| 알림 설정 | `POST /devices/register`, `DELETE /devices` | 푸시 알림 기기 등록/해제 |
| 회원정보 수정 | `PATCH /users/me` | 닉네임, 비밀번호, 프로필 이미지 수정 |
| 문의하기 | `POST /contacts` | 문의 메일 발송 |
| 로그아웃 | 서버 API 없음 | 프론트에서 토큰 삭제 |

## 3. 회원가입

### `POST /auth/register`

- 인증: 필요 없음
- 요청 형식: `multipart/form-data`
- 비밀번호는 최소 6자입니다.

요청 필드:

| 필드명 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `username` | string | O | 사용자 식별명. 별도 아이디가 없으면 이메일과 같은 값 사용 |
| `email` | string | O | 로그인 이메일 |
| `password` | string | O | 비밀번호 |
| `nickname` | string | X | 앱에 표시할 이름 |
| `profile_image` | file | X | 프로필 이미지. jpg, jpeg, png, webp 가능 |
| `snapshot_consent` | boolean string | X | 자세 스냅샷 저장 동의 여부 |

요청 예시:

```text
username=tester@example.com
email=tester@example.com
password=password-123
nickname=거북이
snapshot_consent=true
profile_image=<file>
```

성공 응답 `201`:

```json
{
  "message": "User registered successfully.",
  "user": {
    "id": 1,
    "username": "tester@example.com",
    "email": "tester@example.com",
    "nickname": "거북이",
    "profile_image": "/uploads/profiles/profile_123.png",
    "snapshot_consent": true
  },
  "token": "<jwt>"
}
```

프론트 처리:

- 가입 성공 후 바로 로그인 상태로 보낼 경우 `token` 저장
- 가입 후 로그인 화면으로 보낼 경우 `token`을 저장하지 않아도 됨

## 4. 로그인

### `POST /auth/login`

- 인증: 필요 없음
- 요청 형식: `application/json`

요청:

```json
{
  "email": "tester@example.com",
  "password": "password-123"
}
```

성공 응답 `200`:

```json
{
  "message": "Login successful.",
  "user": {
    "id": 1,
    "username": "tester@example.com",
    "email": "tester@example.com"
  },
  "token": "<jwt>"
}
```

프론트 처리:

- `token`을 저장합니다.
- 이후 모든 보호 API 호출에 `Authorization: Bearer <jwt>`를 붙입니다.
- 닉네임, 프로필 이미지가 필요하면 로그인 후 `GET /users/me`를 호출합니다.

## 5. 홈 대시보드

### 오늘 데이터 조회

`GET /dashboard/today`

- 인증: 필요
- 오늘의 총 이용시간, 거북목 감지 횟수, 바른 자세 유지율 파이차트에 사용합니다.

성공 응답 `200`:

```json
{
  "message": "Today dashboard fetched successfully.",
  "data": {
    "total_usage_seconds": 10800,
    "total_usage_minutes": 180,
    "normal_seconds": 4860,
    "warning_seconds": 3420,
    "danger_seconds": 2520,
    "danger_count": 12,
    "good_posture_rate": 45
  }
}
```

화면 매핑:

| 화면 요소 | 응답값 | 표시 예시 |
| --- | --- | --- |
| 오늘의 총 이용시간 | `data.total_usage_minutes` | `180분`, `3시간` |
| 거북목 감지 횟수 | `data.danger_count` | `12회` |
| 바른 자세 유지율 | `data.good_posture_rate` | `45%` |
| 파이차트 정상 구간 | `data.normal_seconds` | 정상 자세 시간 |
| 파이차트 주의 구간 | `data.warning_seconds` | 주의 자세 시간 |
| 파이차트 위험 구간 | `data.danger_seconds` | 거북목/위험 자세 시간 |

파이차트는 `normal_seconds`, `warning_seconds`, `danger_seconds`를 합산해서 비율로 그리면 됩니다.

## 6. 주간 그래프

### 주간 데이터 조회

`GET /dashboard/weekly`

- 인증: 필요
- 최근 7일 데이터를 반환합니다.

성공 응답 `200`:

```json
{
  "message": "Weekly dashboard fetched successfully.",
  "data": {
    "summary": {
      "total_usage_seconds": 600,
      "normal_seconds": 300,
      "warning_seconds": 180,
      "danger_seconds": 120,
      "danger_count": 1,
      "total_usage_minutes": 10,
      "good_posture_rate": 50
    },
    "chart": [
      {
        "date": "2026-04-24",
        "day_label": "Fri",
        "total_usage_seconds": 180,
        "total_usage_minutes": 3,
        "normal_seconds": 120,
        "warning_seconds": 60,
        "danger_seconds": 0,
        "danger_count": 0,
        "good_posture_rate": 66.67
      }
    ],
    "peak_usage_day": {
      "date": "2026-04-24",
      "day_label": "Fri",
      "total_usage_seconds": 180,
      "total_usage_minutes": 3
    }
  }
}
```

화면 매핑:

| 그래프 요소 | 응답값 |
| --- | --- |
| x축 날짜 | `data.chart[].date` |
| x축 요일 | `data.chart[].day_label` |
| 사용시간 막대그래프 | `data.chart[].total_usage_minutes` |
| 자세 유지율 그래프 | `data.chart[].good_posture_rate` |
| 주간 합계 | `data.summary.total_usage_minutes` |

## 7. 알림 내역

### 알림 목록 조회

`GET /notifications`

- 인증: 필요
- 최신순으로 반환됩니다.

성공 응답 `200`:

```json
[
  {
    "id": 10,
    "user_id": 1,
    "status": "danger",
    "message": "Bad posture detected for 5 seconds. Please correct your posture now.",
    "created_at": "2026-04-30 13:31:00"
  }
]
```

화면 매핑:

| 화면 요소 | 응답값 |
| --- | --- |
| 알림 시간 | `created_at` |
| 알림 문구 | `message` |
| 알림 상태 | `status` |

오늘/어제/그저께 그룹은 프론트에서 `created_at` 기준으로 나누면 됩니다.

### 알림 직접 생성

`POST /notifications`

- 인증: 필요
- 일반 앱 화면에서 직접 호출할 일은 거의 없습니다.
- 테스트나 내부 알림 생성용입니다.

요청:

```json
{
  "status": "warning",
  "message": "Please fix your posture."
}
```

## 8. 알림 설정

현재 백엔드에는 알림 설정 화면의 모든 토글을 저장하는 전용 API가 없습니다.

현재 사용 가능한 API는 FCM 기기 등록/해제입니다.

### 푸시 기기 등록

`POST /devices/register`

- 인증: 필요
- 앱에서 FCM 토큰을 받은 후 호출합니다.
- 실시간 자세 경고 알림을 켤 때 사용합니다.

요청:

```json
{
  "device_type": "ios",
  "fcm_token": "<fcm-token>"
}
```

성공 응답:

- 새 등록: `201`
- 기존 토큰 갱신: `200`

### 푸시 기기 해제

`DELETE /devices`

- 인증: 필요
- 실시간 자세 경고 알림을 끄거나 로그아웃할 때 현재 기기 토큰을 제거합니다.

요청:

```json
{
  "fcm_token": "<fcm-token>"
}
```

성공 응답 `200`:

```json
{
  "message": "Device deleted successfully.",
  "deletedCount": 1
}
```

알림설정 화면 처리 권장:

| 설정 항목 | 현재 처리 방식 |
| --- | --- |
| 실시간 자세 경고 알림 | ON: `POST /devices/register`, OFF: `DELETE /devices` |
| 알림 주기 | 현재 서버 저장 API 없음. 프론트 로컬 저장 필요 |
| 바른 자세 알림 | 현재 서버 저장 API 없음. 프론트 로컬 저장 필요 |
| 리포트 발행 알림 | 현재 서버 저장 API 없음. 프론트 로컬 저장 필요 |

서버 저장이 필요하면 추후 `GET /notification-settings`, `PATCH /notification-settings` API를 추가해야 합니다.

## 9. 회원정보

### 내 정보 조회

`GET /users/me`

- 인증: 필요
- 마이페이지와 회원정보 수정 화면 초기값에 사용합니다.

성공 응답 `200`:

```json
{
  "message": "User profile fetched successfully.",
  "data": {
    "id": 1,
    "username": "tester@example.com",
    "email": "tester@example.com",
    "nickname": "거북이",
    "profile_image": "/uploads/profiles/profile_123.png",
    "snapshot_consent": false,
    "created_at": "2026-04-16 12:00:00",
    "updated_at": "2026-04-16 12:30:00"
  }
}
```

## 10. 스냅샷 갤러리

### 목록 조회

`GET /snapshots`

성공 응답 `200`:

```json
{
  "message": "Snapshots fetched successfully.",
  "data": [
    {
      "id": 1,
      "image_path": "/uploads/snapshots/snapshot_1_123.png",
      "created_at": "2026-05-15 12:00:00"
    }
  ]
}
```

### 업로드

`POST /snapshots`

- 요청 형식: `multipart/form-data`
- 필드명: `snapshot_image`
- 동의한 사용자만 업로드 가능

### 일괄 삭제

`DELETE /snapshots`

```json
{
  "ids": [1, 2, 3]
}
```

### 회원정보 수정

`PATCH /users/me`

- 인증: 필요
- 닉네임/비밀번호만 수정하면 `application/json`
- 프로필 이미지도 수정하면 `multipart/form-data`
- 이메일 수정은 현재 지원하지 않습니다.

JSON 요청:

```json
{
  "nickname": "새닉네임",
  "password": "new-password-123",
  "snapshot_consent": true
}
```

파일 포함 요청:

```text
nickname=새닉네임
password=new-password-123
snapshot_consent=true
profile_image=<file>
```

성공 응답 `200`:

```json
{
  "message": "User profile updated successfully.",
  "data": {
    "id": 1,
    "username": "tester@example.com",
    "email": "tester@example.com",
    "nickname": "새닉네임",
    "profile_image": "/uploads/profiles/profile_456.png",
    "created_at": "2026-04-16 12:00:00",
    "updated_at": "2026-04-30 13:17:00"
  }
}
```

## 10. 문의하기

### 문의 전송

`POST /contacts`

- 인증: 필요
- 문의 답변 받을 이메일은 로그인 사용자의 가입 이메일로 자동 설정됩니다.
- 텍스트만 보내면 `application/json`
- 첨부파일이 있으면 `multipart/form-data`

카테고리 매핑:

| 화면 문구 | 요청값 `category` |
| --- | --- |
| 오류 신고 | `bug_report` |
| 개선 제안 | `feature_request` |
| 기타 문의 | `other` |

JSON 요청:

```json
{
  "category": "bug_report",
  "content": "대시보드 그래프가 갱신되지 않습니다."
}
```

파일 포함 요청:

```text
category=feature_request
content=주간 리포트 공유 기능을 추가해주세요.
attachments=<file>
attachments=<file>
```

제한:

- 문의 내용 `content`: 최대 5000자
- 첨부파일 `attachments`: 최대 5개
- 허용 확장자: `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`, `.txt`

성공 응답 `201`:

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

## 11. 로그아웃

로그아웃 전용 서버 API는 없습니다.

프론트 처리 순서:

1. 현재 기기의 FCM 토큰이 있으면 `DELETE /devices`를 호출합니다.
2. 저장된 JWT 토큰을 삭제합니다.
3. 로그인 화면으로 이동합니다.

## 12. 자세 추적 API

대시보드 데이터를 쌓으려면 자세 분석 결과를 서버에 저장해야 합니다.

### 자세 상태 전송

`POST /posture/heartbeat`

- 인증: 필요
- 카메라/AI가 판단한 현재 자세 상태를 주기적으로 서버에 보냅니다.
- 자세 상태가 바뀌면 이전 상태의 지속 시간이 자동으로 로그에 저장됩니다.

요청:

```json
{
  "status": "bad"
}
```

상태값:

| 앱 상태 | 요청값 `status` | 서버 저장 상태 |
| --- | --- | --- |
| 좋음 | `good` | `normal` |
| 주의 | `caution` | `warning` |
| 나쁨/거북목 | `bad` | `danger` |

성공 응답 `200`:

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
      "notification_id": 10,
      "push": {
        "delivered": true,
        "reason": null,
        "successCount": 1,
        "failureCount": 0
      }
    }
  }
}
```

### 자세 로그 직접 저장

`POST /posture/log`

- 인증: 필요
- 분석이 끝난 자세 사용 구간을 직접 저장할 때 사용합니다.

요청:

```json
{
  "status": "danger",
  "duration_seconds": 12,
  "recorded_at": "2026-04-30T13:31:00Z"
}
```

허용 상태:

- `normal`: 정상 자세
- `warning`: 주의 자세
- `danger`: 거북목/위험 자세

## 13. 에러 처리

대표 상태 코드:

| 상태 코드 | 의미 |
| --- | --- |
| `200` | 성공 |
| `201` | 생성 성공 |
| `400` | 요청값 오류 |
| `401` | 토큰 없음 |
| `403` | 토큰 만료 또는 권한 없음 |
| `404` | 데이터 없음 |
| `409` | 중복 이메일 |
| `500` | 서버 오류 |
| `503` | 외부 서비스 또는 메일 설정 없음 |

에러 응답 예시:

```json
{
  "message": "Error message",
  "error": "Optional detail"
}
```
