# 프론트엔드 인수인계 문서

## 먼저 볼 문서

- [FRONTEND_API_GUIDE.md](./FRONTEND_API_GUIDE.md)
- [API_LIST.md](./API_LIST.md)
- [README.md](./README.md)

## 프론트엔드 담당 범위

프론트엔드는 아래 기능을 구현합니다.

- 회원가입, 로그인
- JWT 토큰 저장 및 보호 API 호출
- 내 프로필 조회와 수정
- FCM 토큰 등록 및 해제
- 오늘 대시보드 조회
- 주간 대시보드 조회
- 알림 내역 표시
- 문의하기 전송
- 로그아웃 처리

프론트엔드가 직접 처리하지 않아도 되는 부분:

- 자세 지속 시간 계산
- `good / caution / bad` 상태 분류
- 지속적인 자세 heartbeat 전송

위 기능은 현재 계약상 CV와 백엔드가 담당합니다.

## 프론트엔드 주요 API

### 인증

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

### 사용자

- `GET /users/me`
- `PATCH /users/me`

### 대시보드

- `GET /dashboard/today`
- `GET /dashboard/weekly`

### 알림/기기

- `GET /notifications`
- `POST /devices/register`
- `GET /devices`
- `DELETE /devices`

### 문의하기

- `POST /contacts`

### 선택 또는 테스트용 API

- `POST /push/send`
- `GET /landmark/latest`

## 로그인 흐름

### 1. 로그인 요청

- `POST /auth/login` 호출
- 응답으로 받은 JWT 토큰 저장
- 이후 보호 API에는 아래 헤더를 붙임

```http
Authorization: Bearer <token>
```

### 2. 세션 확인

- 저장된 토큰이 유효한지 확인하려면 `GET /auth/me` 호출
- `401` 또는 `403`이면 로그인 화면으로 이동

## 회원정보 흐름

### `GET /users/me`

아래 정보를 불러올 때 사용합니다.

- `username`
- `email`
- `nickname`
- `profile_image`
- `snapshot_consent`

### `PATCH /users/me`

아래 정보를 수정할 때 사용합니다.

- 닉네임
- 비밀번호
- 프로필 이미지
- 스냅샷 저장 동의

이미지를 업로드할 경우:

- 요청 형식은 `multipart/form-data`
- 파일 필드명은 반드시 `profile_image`

## 대시보드 흐름

### 스냅샷 갤러리

- `GET /snapshots`: 스냅샷 목록 조회
- `POST /snapshots`: 새 스냅샷 업로드
- `DELETE /snapshots`: 선택한 스냅샷 일괄 삭제

### 오늘 대시보드

`GET /dashboard/today` 사용

중요 필드:

- `data.total_usage_minutes`
- `data.normal_seconds`
- `data.warning_seconds`
- `data.danger_seconds`
- `data.danger_count`
- `data.good_posture_rate`

화면 연결:

- 오늘 총 이용 시간: `total_usage_minutes`
- 거북목 감지 횟수: `danger_count`
- 바른 자세 유지율: `good_posture_rate`
- 파이차트: `normal_seconds`, `warning_seconds`, `danger_seconds`

### 주간 대시보드

`GET /dashboard/weekly` 사용

중요 필드:

- `data.summary`
- `data.chart`
- `data.peak_usage_day`

`chart` 안에서 주로 쓰는 필드:

- `date`
- `day_label`
- `total_usage_minutes`
- `normal_seconds`
- `warning_seconds`
- `danger_seconds`
- `good_posture_rate`

그래프 추천:

- 단순 막대그래프: `total_usage_minutes`
- 누적 막대그래프: `normal_seconds`, `warning_seconds`, `danger_seconds`
- 자세 유지율 그래프: `good_posture_rate`

## 알림/푸시 흐름

### FCM 토큰 등록

`POST /devices/register`

요청:

```json
{
  "device_type": "web",
  "fcm_token": "token-123"
}
```

웹이면 `device_type`은 `web`을 사용합니다.
iOS 앱이면 `ios`, Android 앱이면 `android`를 사용합니다.

### 알림 목록 조회

`GET /notifications`

알림은 최신순으로 내려옵니다.
오늘/어제/그저께 그룹은 프론트에서 `created_at` 기준으로 나눕니다.

### 알림 설정

현재 서버는 세부 알림 설정 저장 API가 없습니다.

- 실시간 자세 경고 알림 ON: `POST /devices/register`
- 실시간 자세 경고 알림 OFF: `DELETE /devices`
- 알림 주기, 바른 자세 알림, 리포트 발행 알림: 프론트 로컬 저장 필요

## 문의하기 흐름

`POST /contacts`

- 텍스트만 전송: `application/json`
- 첨부파일 포함: `multipart/form-data`
- 첨부파일 필드명: `attachments`
- 최대 첨부 수: 5개

카테고리 요청값:

- 오류 신고: `bug_report`
- 개선 제안: `feature_request`
- 기타 문의: `other`

## 메인 프론트 흐름에서 필요 없는 API

아래 API는 존재하지만 일반 화면 개발자가 직접 호출하지 않아도 됩니다.

- `POST /posture/heartbeat`
- `POST /posture/log`
- `POST /posture/analyze`

이유:

- CV가 자세 상태를 보냅니다.
- 백엔드가 지속 시간을 계산하고 로그를 저장합니다.
- 대시보드는 저장된 `PostureLogs`를 집계해서 보여줍니다.

## 요청 형식 주의사항

### JSON 요청

```http
Content-Type: application/json
```

### 파일 업로드 요청

```http
Content-Type: multipart/form-data
```

브라우저나 앱 라이브러리에서 `FormData`를 쓰는 경우 `Content-Type`은 직접 지정하지 않는 편이 안전합니다.

## 프론트엔드 체크리스트

- 로그인 후 토큰을 저장했는지
- 보호 API에 Bearer 토큰을 붙였는지
- 프로필 이미지 업로드 필드명이 `profile_image`인지
- 문의 첨부파일 필드명이 `attachments`인지
- 주간 그래프가 7개 항목을 처리하는지
- 대시보드 값이 0인 빈 상태 UI를 처리하는지
- 알림 목록이 비어 있을 때 UI를 처리하는지
- 로그아웃 시 토큰 삭제와 FCM 토큰 해제를 처리하는지

## 연동이 안 될 때 확인 순서

1. 토큰이 포함되어 있는지 확인
2. 요청 경로가 [API_LIST.md](./API_LIST.md)와 같은지 확인
3. `multipart/form-data`와 `application/json`을 잘 구분했는지 확인
4. 필드명이 정확한지 확인
5. 대시보드 데이터가 실제로 `PostureLogs`에 쌓였는지 확인
