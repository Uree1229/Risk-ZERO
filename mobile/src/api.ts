import type { RiskLevel, SystemSnapshot } from "./types";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "";
const API_CONFIGURED = API_BASE_URL.length > 0;

const scenarioFixtures: Record<string, { label: string; score: number; level: Exclude<RiskLevel, "pending">; dwell: number; vibration: number; summary: string; reasons: string[]; response: string }> = {
  normal: { label: "정상 방문", score: 14, level: "normal", dwell: 7, vibration: 0, summary: "짧은 방문이 감지되었습니다.", reasons: ["짧은 체류", "진동 없음"], response: "별도 확인이 필요하지 않습니다." },
  watch: { label: "주의 관찰", score: 46, level: "watch", dwell: 28, vibration: 1, summary: "현관 앞 체류가 길어지고 있습니다.", reasons: ["체류 시간 증가", "일회성 진동"], response: "현관 상황을 확인해 주세요." },
  warning: { label: "위험 징후", score: 68, level: "warning", dwell: 49, vibration: 3, summary: "장시간 체류와 반복 진동이 감지되었습니다.", reasons: ["장시간 체류", "반복 진동"], response: "보호자 확인이 필요합니다." },
  critical: { label: "고위험", score: 88, level: "critical", dwell: 76, vibration: 7, summary: "강한 반복 진동과 문 주변 충격이 감지되었습니다.", reasons: ["장시간 체류", "반복적인 강한 진동"], response: "거주자에게 연락하고 상황을 확인하세요." },
};

function fallbackSnapshot(scenarioId: string): SystemSnapshot {
  const fixture = scenarioFixtures[scenarioId] ?? scenarioFixtures.normal;
  const currentTime = new Date();
  const now = currentTime.toISOString();
  const atToday = (hour: number, minute: number) => {
    const date = new Date(currentTime);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  return {
    mode: "demo",
    scenarioId,
    scenarioLabel: fixture.label,
    generatedAt: now,
    sensorEvent: {
      id: `mobile-fallback-${scenarioId}`,
      source: {
        provider: "MobileDemoFallback",
        deviceId: "RZ-MOBILE-01",
        transport: "demo",
        batteryPercent: 78,
        storageUsedBytes: 186 * 1024 * 1024,
        storageCapacityBytes: 1024 * 1024 * 1024,
      },
      readings: [
        { id: "presence", metric: "presence", label: "사람 감지", value: true, quality: "good", capturedAt: now },
        { id: "dwell", metric: "dwell_seconds", label: "체류 시간", value: fixture.dwell, unit: "초", quality: "good", capturedAt: now },
        { id: "vibration", metric: "vibration_count", label: "진동 횟수", value: fixture.vibration, unit: "회", quality: "good", capturedAt: now },
        { id: "door", metric: "door_state", label: "문 상태", value: "닫힘", quality: "good", capturedAt: now },
      ],
    },
    assessment: { status: "demo", engine: "DemoPassThroughRiskEngine", algorithmVersion: null, score: fixture.score, level: fixture.level, summary: fixture.summary, reasons: fixture.reasons },
    response: { status: "preview", actions: fixture.level === "normal" ? ["standby"] : ["guardian_notice"], message: fixture.response },
    recentEvents: [
      { id: "m1", capturedAt: atToday(17, 24), occurredAt: "17:24", title: "정상 방문", detail: "7초 체류 · 진동 없음", level: "normal", score: 14 },
      { id: "m2", capturedAt: atToday(14, 10), occurredAt: "14:10", title: "주의 관찰", detail: "28초 체류 · 진동 1회", level: "watch", score: 46 },
      { id: "m3", capturedAt: atToday(9, 31), occurredAt: "09:31", title: "위험 징후", detail: "49초 체류 · 반복 진동", level: "warning", score: 68 },
    ],
  };
}

export async function getSnapshot(scenarioId: string): Promise<{ snapshot: SystemSnapshot; source: "api" | "fallback" }> {
  if (!API_CONFIGURED) {
    return { snapshot: fallbackSnapshot(scenarioId), source: "fallback" };
  }

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

export { API_BASE_URL, API_CONFIGURED };
