# NeckOn Backend

2026년 1학기 AIX 프로젝트 심화에서 개발한 NeckOn 백엔드입니다. 이 저장소의 `Backend` 브랜치에는 백엔드 소스만 포함됩니다.

## 프로젝트 위치

실행 가능한 Node.js 프로젝트는 [`turtle-neck`](./turtle-neck) 디렉터리에 있습니다.

## 주요 기능

- JWT 기반 회원가입, 로그인 및 사용자 인증
- 사용자 프로필과 이미지 관리
- 자세 랜드마크 저장 및 자세 상태 분석
- 일간·주간 자세 통계 제공
- FCM 기기 등록 및 푸시 알림
- 문의 메일 전송
- 선택적 Python AI 자세 분석 서비스 연동

## 기술 스택

- Node.js 22, Express 5
- SQLite3
- JSON Web Token, bcrypt
- Firebase Admin SDK
- Nodemailer

## 실행 방법

```bash
cd turtle-neck
npm install
copy .env.example .env
npm start
```

기본 상태 확인 경로는 `GET /health`입니다. 테스트는 `npm test`로 실행합니다.

## 환경변수

실제 인증정보는 커밋하지 않습니다. [`turtle-neck/.env.example`](./turtle-neck/.env.example)을 복사한 뒤 JWT, Firebase, SMTP 등의 값을 로컬 환경에 설정하세요.

## 문서

- [API 목록](./turtle-neck/API_LIST.md)
- [웹 프론트엔드 연동 가이드](./turtle-neck/FRONTEND_API_GUIDE.md)
- [AI 연동 가이드](./turtle-neck/AI_HANDOFF.md)

## 저장소 제외 항목

`deploy`, `turtle-neck-update.zip`, 의존성, 로컬 DB, 업로드 파일, 로그, 실제 환경변수 및 서비스 계정 파일은 버전 관리에서 제외합니다.
