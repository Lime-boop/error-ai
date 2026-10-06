import './globals.css';

export const metadata = {
  title: 'Error AI',
  description: '에러 캡처와 메시지를 AI로 분석하는 개발 도우미',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
