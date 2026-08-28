import type {
  DoorHubEventRecord,
  DoorHubEventSummary,
  DoorHubSnapshot,
  EventLogItem,
  SafetyDecision,
} from "./types";

function decisionMeta(decision: SafetyDecision) {
  if (decision === "allow") return { decision: "pass" as const, level: "normal" as const };
  if (decision === "block") return { decision: "block" as const, level: "warning" as const };
  if (decision === "abort") return { decision: "block" as const, level: "critical" as const };
  return { decision: "pending" as const, level: "pending" as const };
}

export function summarizeDoorHubRecord(record: DoorHubEventRecord): DoorHubEventSummary {
  const zone = record.vision.primaryZone ? `구역 ${record.vision.primaryZone}` : "구역 없음";
  let title = record.vision.visitorPresent ? "방문자 관찰" : "방문 후 이탈";
  if (record.safety.decision === "abort" || record.safety.faultLatched) title = "안전 입력 차단";
  else if (record.safety.decision === "block") title = "제어 요청 차단";
  else if (record.safety.decision === "allow") title = "제어 요청 허용";
  return {
    eventId: record.session.eventId,
    occurredAt: new Date(record.generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
    title,
    detail: `${zone} · ${Math.round(record.vision.dwellMs / 1000)}초 체류${record.vision.backgroundChanged ? " · 배경 변경" : ""}`,
    decision: record.safety.decision,
  };
}

export function recordsToDoorHubSnapshot(records: DoorHubEventRecord[]) {
  const [latest] = records;
  return latest ? { ...latest, recentEvents: records.map(summarizeDoorHubRecord) } : null;
}

export function doorHubSnapshotToEventLogItems(snapshot: DoorHubSnapshot): EventLogItem[] {
  return snapshot.recentEvents.map((event, index) => {
    const meta = decisionMeta(event.decision);
    return {
      id: `${snapshot.deviceId}:${event.eventId}`,
      capturedAt: index === 0 ? snapshot.generatedAt : undefined,
      occurredAt: event.occurredAt,
      title: event.title,
      detail: event.detail,
      level: meta.level,
      score: null,
      decision: meta.decision,
      confidence: null,
      reasonCodes: event.decision === "none" ? [] : [`safety_${event.decision}`],
    };
  });
}
