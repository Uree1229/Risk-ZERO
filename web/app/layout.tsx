import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-av.png`;

  return {
    title: "RISK-ZERO | 현관 동선 모니터",
    description: "현관 앞 사람의 진입·체류·이탈 경로와 이상행동을 확인하는 RISK-ZERO 모니터",
    openGraph: {
      title: "RISK-ZERO",
      description: "현관 앞 사람의 이동 경로와 확인이 필요한 상황을 살펴보세요.",
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "RISK-ZERO 현관 동선 모니터" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "RISK-ZERO",
      description: "현관 앞 사람의 이동 경로와 확인이 필요한 상황을 살펴보세요.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
