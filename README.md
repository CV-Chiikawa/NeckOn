# NeckOn App

2026년 1학기 AIX 프로젝트 심화에서 개발한 NeckOn 모바일 앱입니다. 이 저장소의 `App` 브랜치에는 Expo/React Native 앱 소스만 포함됩니다.

## 주요 기능

- 회원가입, 로그인 및 안전한 토큰 저장
- 자세 현황 대시보드
- 알림 목록과 알림 설정
- 사용자 프로필 조회·수정
- 자세 스냅샷과 문의 기능
- 단계별 스트레칭 콘텐츠

## 기술 스택

- Expo SDK 54
- React Native 0.81
- React 19, TypeScript
- Expo Router
- Expo Secure Store

## 실행 방법

```bash
cd neckon-app
npm install
copy .env.example .env
npm start
```

필요에 따라 `npm run android`, `npm run ios`, `npm run web`을 사용할 수 있습니다.

## 환경변수

`.env`에는 백엔드 주소를 설정합니다.

```env
EXPO_PUBLIC_API_BASE_URL=https://your-api-server.example.com
```

실제 서버 주소나 인증정보가 들어 있는 `.env`는 커밋하지 않습니다.

## 저장소 제외 항목

`node_modules`, Expo 캐시, EAS 빌드 산출물, 로컬 환경변수, 로그 및 IDE 설정은 버전 관리에서 제외합니다.
