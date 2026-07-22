import type { RiskLevel, SystemSnapshot } from "./types";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001";

const scenarioFixtures: Record<string, { label: string; score: number; level: Exclude<RiskLevel, "pending">; dwell: number; vibration: number; summary: string; reasons: string[] }> = {
  normal: { label: "정상 방문", score: 14, level: "normal", dwell: 7, vibration: 0, summary: "정상적인 짧은 방문으로 표시된 더미 결과입니다.", reasons: ["짧은 체류", "진동 없음"] },
  watch: { label: "주의 관찰", score: 46, level: "watch", dwell: 28, vibration: 1, summary: "현관 앞 체류가 길어진 상황을 재현합니다.", reasons: ["체류 시간 증가", "일회성 진동"] },
  warning: { label: "위험 징후", score: 68, level: "warning", dwell: 49, vibration: 3, summary: "카메라와 보호자 알림 흐름을 확인하는 더미 결과입니다.", reasons: ["장시간 체류", "반복 진동"] },
  critical: { label: "고위험 시연", score: 88, level: "critical", dwell: 76, vibration: 7, summary: "고위험 대응 화면을 확인하기 위한 고정 더미 값입니다.", reasons: ["장시간 체류", "반복적인 강한 진동"] },
};

function fallbackSnapshot(scenarioId: string): SystemSnapshot {
  const fixture = scenarioFixtures[scenarioId] ?? scenarioFixtures.normal;
  const now = new Date().toISOString();
  return {
    mode: "demo",
    scenarioId,
    scenarioLabel: fixture.label,
    generatedAt: now,
    sensorEvent: {
      id: `mobile-fallback-${scenarioId}`,
      source: { provider: "MobileDemoFallback", deviceId: "RZ-MOBILE-01", transport: "demo" },
      readings: [
        { id: "presence", metric: "presence", label: "사람 감지", value: true, quality: "good", capturedAt: now },
        { id: "dwell", metric: "dwell_seconds", label: "체류 시간", value: fixture.dwell, unit: "초", quality: "good", capturedAt: now },
        { id: "vibration", metric: "vibration_count", label: "진동 횟수", value: fixture.vibration, unit: "회", quality: "good", capturedAt: now },
        { id: "door", metric: "door_state", label: "문 상태", value: "닫힘", quality: "good", capturedAt: now },
      ],
    },
    assessment: { status: "demo", engine: "DemoPassThroughRiskEngine", algorithmVersion: null, score: fixture.score, level: fixture.level, summary: fixture.summary, reasons: fixture.reasons },
    response: { status: "preview", actions: fixture.level === "normal" ? ["standby"] : ["guardian_notice"], message: "실제 장치 제어 없이 대응 화면만 표시합니다." },
    recentEvents: [
      { id: "m1", occurredAt: "17:24", title: "정상 방문", detail: "7초 체류 · 진동 없음", level: "normal", score: 14 },
      { id: "m2", occurredAt: "14:10", title: "주의 관찰", detail: "28초 체류 · 진동 1회", level: "watch", score: 46 },
      { id: "m3", occurredAt: "09:31", title: "위험 징후", detail: "49초 체류 · 반복 진동", level: "warning", score: 68 },
    ],
  };
}

export async function getSnapshot(scenarioId: string): Promise<{ snapshot: SystemSnapshot; source: "api" | "fallback" }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(`${API_BASE_URL}/api/snapshot?scenario=${scenarioId}`, { signal: controller.signal });
    if (!response.ok) throw new Error("API unavailable");
    return { snapshot: (await response.json()) as SystemSnapshot, source: "api" };
  } catch {
    return { snapshot: fallbackSnapshot(scenarioId), source: "fallback" };
  } finally {
    clearTimeout(timeout);
  }
}

export { API_BASE_URL };
