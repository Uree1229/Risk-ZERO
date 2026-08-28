import type { DoorHubSnapshot, SafetyDecision } from "./door-hub-domain";

export const doorHubScenarioOptions = [
  { id: "delivery", label: "택배 후 이탈" },
  { id: "lingering", label: "장시간 체류" },
  { id: "return", label: "이탈 후 재접근" },
  { id: "safety-abort", label: "안전 입력 차단" },
] as const;

const now = "2026-08-28T19:42:18+09:00";

function recent(decision: SafetyDecision): DoorHubSnapshot["recentEvents"] {
  return [
    { eventId: 1042, occurredAt: "19:42", title: "택배 후 이탈", detail: "구역 6 · 18초 체류 · 배경 변경", decision },
    { eventId: 1041, occurredAt: "18:16", title: "방문 후 이탈", detail: "구역 5 → 2 · 11초 체류", decision: "none" },
    { eventId: 1040, occurredAt: "16:08", title: "제어 요청 차단", detail: "Tamper 입력 감지", decision: "abort" },
  ];
}

export function buildDoorHubDemo(scenarioId = "delivery"): DoorHubSnapshot {
  const common: DoorHubSnapshot = {
    schemaVersion: "door-hub-event/1",
    mode: "demo",
    scenarioId,
    generatedAt: now,
    deviceId: "RZ-DOOR-HUB-DEMO-01",
    session: { eventId: 1042, stage: "result-ready", pirActive: false, startedAt: "2026-08-28T19:41:57+09:00", endedAt: "2026-08-28T19:42:17+09:00" },
    vision: { status: "ready", visitorPresent: false, objectCount: 0, primaryZone: 6, zoneMask: 32, dwellMs: 18_200, backgroundChangeRatio: 0.12, backgroundChanged: true, snapshotReady: true, snapshotRef: null },
    safety: { heartbeatOk: true, authArmed: false, decision: "none", blockReason: null, faultLatched: false, doorClosed: true, tamperDetected: false, emergencyStop: false, outputTarget: "led", outputActive: false },
    recentEvents: recent("none"),
  };

  if (scenarioId === "lingering") {
    return { ...common, session: { ...common.session, eventId: 1043, stage: "capture", pirActive: true, endedAt: null }, vision: { ...common.vision, status: "capturing", visitorPresent: true, objectCount: 1, primaryZone: 8, zoneMask: 128, dwellMs: 67_400, backgroundChangeRatio: 0.02, backgroundChanged: false, snapshotReady: false } };
  }
  if (scenarioId === "return") {
    return { ...common, session: { ...common.session, eventId: 1044 }, vision: { ...common.vision, visitorPresent: true, objectCount: 1, primaryZone: 2, zoneMask: 34, dwellMs: 29_800 }, recentEvents: [{ eventId: 1044, occurredAt: "19:48", title: "이탈 후 재접근", detail: "구역 6 → 이탈 → 구역 2", decision: "block" }, ...common.recentEvents] };
  }
  if (scenarioId === "safety-abort") {
    return { ...common, session: { ...common.session, eventId: 1045, stage: "fault" }, safety: { ...common.safety, decision: "abort", blockReason: "tamper_detected", faultLatched: true, tamperDetected: true }, recentEvents: recent("abort") };
  }
  return common;
}
