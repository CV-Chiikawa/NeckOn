# NeckOn Web Frontend

2026년 1학기 AIX 프로젝트 심화에서 개발한 NeckOn 웹 프론트엔드입니다. 이 저장소의 `Frontend` 브랜치에는 React 웹 소스만 포함됩니다.

## 주요 기능

- 회원가입, 로그인 및 JWT 기반 API 연동
- 웹캠과 MediaPipe를 이용한 자세 랜드마크 추출
- 기준 자세 저장과 실시간 자세 분석
- 일간·주간 대시보드 및 자세 통계
- 프로필 관리와 문의 기능
- 자세 단계별 스트레칭 추천
- 브라우저/FCM 알림 연동

## 기술 스택

- React 18
- Vite 8
- React Router, Axios
- MediaPipe Tasks Vision
- Firebase Cloud Messaging

## 실행 방법

```bash
npm install
copy .env.example .env
npm run dev
```

프로덕션 빌드는 `npm run build`, 정적 검사는 `npm run lint`로 실행합니다.

## 환경변수

`.env.example`을 복사해 백엔드 API 주소와 Firebase 웹 클라이언트 설정을 입력하세요. Firebase 웹 설정값은 클라이언트에 공개되는 값이므로 Firebase 콘솔에서 허용 도메인과 API 제한을 설정하는 것을 권장합니다.

## 저장소 제외 항목

의존성, Vite 빌드 결과, 테스트 결과, 로컬 환경변수, 로그, 캐시 및 IDE 설정은 버전 관리에서 제외합니다.
