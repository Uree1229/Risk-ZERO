import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-av.png`;

  return {
    title: "RISK-ZERO | Door Hub Monitor",
    description: "FPGA 영상 결과와 독립 Safety Gate 상태를 확인하는 RISK-ZERO Door Hub 모니터",
    openGraph: {
      title: "RISK-ZERO",
      description: "현관 방문 세션과 FPGA Vision·Safety Gate 상태를 확인합니다.",
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "RISK-ZERO Door Hub 모니터" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "RISK-ZERO",
      description: "현관 방문 세션과 FPGA Vision·Safety Gate 상태를 확인합니다.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
