# Error AI

개발 중 발생한 에러 화면 또는 에러 메시지를 Gemini가 분석해 원인과 해결 방법을 정리하는 웹앱입니다.

## 구조
- Next.js + Vercel: 사용자 UI
- Supabase Edge Function: 분석 API
- Supabase Postgres: 분석 기록
- Supabase Storage: 에러 캡처 이미지
- Gemini API: 에러 원인/해결 방법 분석

## 보안
브라우저는 데이터베이스에 직접 쓰지 않습니다. DB 쓰기와 읽기는 Supabase Edge Function의 서버 권한으로 처리합니다.
