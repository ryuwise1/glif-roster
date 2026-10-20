import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

// 영문 제목용. 한글 본문은 공식 홈페이지와 같은 Pretendard 를 아래 <link> 로 받는다.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "GLIF 연명부",
  description: "성균관대학교 금융투자학회 GLIF 학회원 전용 연명부",
  icons: { icon: "/glif-favicon-32.png" },
};

export const viewport: Viewport = {
  themeColor: "#172058",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${montserrat.variable} h-full antialiased`}>
      <head>
        {/* 필요한 글자 구간만 받는 Pretendard (glifskku.com 과 같은 글꼴) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
