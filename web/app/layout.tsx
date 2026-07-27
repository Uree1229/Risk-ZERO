import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "RISK-ZERO | 현관 안전 모니터",
    description: "현관 감지 정보와 위험 상태를 확인하는 RISK-ZERO 모니터",
    openGraph: {
      title: "RISK-ZERO",
      description: "현관 감지 정보와 위험 상태를 한눈에 확인하세요.",
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "RISK-ZERO 현관 위험 대응 보조 시스템" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "RISK-ZERO",
      description: "현관 감지 정보와 위험 상태를 한눈에 확인하세요.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
