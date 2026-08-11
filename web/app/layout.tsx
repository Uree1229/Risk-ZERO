import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-av.png`;

  return {
    title: "RISK-ZERO | 시청각 발화 검증",
    description: "음성과 입술 움직임의 일치 여부를 확인하는 RISK-ZERO 모니터",
    openGraph: {
      title: "RISK-ZERO",
      description: "도어락 음성 제어 요청의 시청각 검증 결과를 확인하세요.",
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "RISK-ZERO 시청각 발화 검증 시스템" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "RISK-ZERO",
      description: "도어락 음성 제어 요청의 시청각 검증 결과를 확인하세요.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
