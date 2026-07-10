# AI / CV 인수인계 문서

## 먼저 볼 문서

- [API_LIST.md](./API_LIST.md)
- [README.md](./README.md)

## 현재 연동 방식

현재 CV 쪽은 자세 상태만 백엔드로 보내면 됩니다.

주요 API:

- `POST /posture/heartbeat`

현재 상태값:

- `good`
- `caution`
- `bad`

백엔드 담당:

- 현재 상태가 얼마나 지속되는지 계산
- 상태가 바뀌면 이전 구간을 `PostureLogs`에 저장
- 내부 상태값 매핑
  - `good -> normal`
  - `caution -> warning`
  - `bad -> danger`
- `bad` 상태가 5초 이상 지속되면 알림과 푸시를 한 번 발송

따라서 CV 쪽에서 계산하지 않아도 되는 값:

- `duration_seconds`
- 알림 기준 시간
- 대시보드 집계값

## CV가 반드시 호출해야 하는 API

### `POST /posture/heartbeat`

- 인증: 필요
- 요청 형식: `application/json`

요청:

```json
{
  "status": "bad"
}
```

허용 상태값:

- `good`
- `caution`
- `bad`

권장 전송 방식:

- 상태가 바뀌면 즉시 전송
- 같은 상태가 유지되는 동안에도 주기적으로 heartbeat 전송
- 기본 주기는 1초 정도 권장

## 백엔드 동작 예시

1. CV가 `good` 전송
2. 이후 CV가 `caution` 전송
3. 백엔드는 이전 `good` 구간을 `PostureLogs`에 저장
4. 이후 CV가 `bad`를 계속 전송
5. `bad`가 5초 이상 지속되면 백엔드가 알림을 한 번 생성
6. `bad`에서 다른 상태로 바뀌면 `bad` 구간을 `PostureLogs`에 저장

## 선택적으로 사용할 수 있는 Landmark API

아래 API는 아직 존재하지만 실시간 자세 세션의 기본 계약은 아닙니다.

- `POST /landmark`
- `POST /posture/analyze`

필요할 때만 사용하세요.

- 기준 자세 landmark 저장
- 자세 feature 계산 디버깅
- 백엔드 raw landmark 파싱 검증

## Raw Landmark 요청 예시

기준 자세 저장 또는 디버깅 분석이 필요하면 아래 형태로 보냅니다.

```json
{
  "reference_side": "right",
  "landmarks": {
    "nose": { "x": 0.50, "y": 0.20, "z": -0.01, "visibility": 0.95 },
    "nose_tip": { "x": 0.53, "y": 0.21, "z": -0.02, "visibility": 0.99 },
    "left_ear": { "x": 0.46, "y": 0.22, "z": -0.01, "visibility": 0.31 },
    "right_ear": { "x": 0.64, "y": 0.26, "z": -0.04, "visibility": 0.96 },
    "left_shoulder": { "x": 0.44, "y": 0.41, "z": 0.01, "visibility": 0.35 },
    "right_shoulder": { "x": 0.56, "y": 0.41, "z": 0.02, "visibility": 0.97 }
  }
}
```

Raw 분석 필수 landmark:

- `nose`
- `left_ear`
- `right_ear`
- `left_shoulder`
- `right_shoulder`

선택 landmark:

- `nose_tip`
- `mouth_left`
- `mouth_right`

## CV가 더 이상 보내지 않아도 되는 값

현재 계약에서는 CV가 아래 값을 보내지 않아도 됩니다.

- `duration_seconds`
- `recorded_at`
- `normal / warning / danger`

백엔드가 처리하는 부분:

- 지속 시간 계산
- 내부 상태값 변환
- 알림 타이밍 판단
- 대시보드용 로그 생성

## CV 체크리스트

- 상태값이 정확히 아래 셋 중 하나인지 확인
  - `good`
  - `caution`
  - `bad`
- 같은 상태가 유지되어도 heartbeat가 계속 전송되는지 확인
- heartbeat 주기가 너무 불규칙하지 않은지 확인
- 보호 API에 Bearer 토큰이 포함되는지 확인

## 연동이 안 될 때 확인 순서

1. 토큰이 포함되어 있는지 확인
2. 요청 경로가 `/posture/heartbeat`인지 확인
3. `status` 값이 `good | caution | bad` 중 하나인지 확인
4. 지속 상태에서도 heartbeat가 반복 전송되는지 확인
5. 푸시 알림을 기대한다면 Firebase 인증 정보가 설정되어 있는지 확인
