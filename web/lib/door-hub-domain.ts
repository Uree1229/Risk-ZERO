export type DoorHubStage =
  | "idle"
  | "vision-wake"
  | "camera-init"
  | "capture"
  | "end-background"
  | "result-ready"
  | "vision-sleep"
  | "fault";

export type SafetyDecision = "none" | "allow" | "block" | "abort";

export interface DoorHubEventSummary {
  eventId: number;
  occurredAt: string;
  title: string;
  detail: string;
  decision: SafetyDecision;
}

export interface DoorHubSnapshot {
  schemaVersion: "door-hub-event/1";
  mode: "demo" | "live";
  scenarioId: string;
  generatedAt: string;
  deviceId: string;
  session: {
    eventId: number;
    stage: DoorHubStage;
    pirActive: boolean;
    startedAt: string;
    endedAt: string | null;
  };
  vision: {
    status: "ready" | "capturing" | "sleeping" | "fault";
    visitorPresent: boolean;
    objectCount: number;
    primaryZone: number | null;
    zoneMask: number;
    dwellMs: number;
    backgroundChangeRatio: number;
    backgroundChanged: boolean;
    snapshotReady: boolean;
    snapshotRef: string | null;
  };
  safety: {
    heartbeatOk: boolean;
    authArmed: boolean;
    decision: SafetyDecision;
    blockReason: string | null;
    faultLatched: boolean;
    doorClosed: boolean;
    tamperDetected: boolean;
    emergencyStop: boolean;
    outputTarget: "led";
    outputActive: boolean;
  };
  recentEvents: DoorHubEventSummary[];
}

export type DoorHubEventRecord = Omit<DoorHubSnapshot, "recentEvents">;

export function eventRecordSummary(record: DoorHubEventRecord): DoorHubEventSummary {
  const zone = record.vision.primaryZone ? `구역 ${record.vision.primaryZone}` : "구역 없음";
  const dwell = `${Math.round(record.vision.dwellMs / 1000)}초 체류`;
  let title = record.vision.visitorPresent ? "방문자 관찰" : "방문 후 이탈";
  if (record.safety.decision === "abort" || record.safety.faultLatched) title = "안전 입력 차단";
  else if (record.safety.decision === "block") title = "제어 요청 차단";
  else if (record.safety.decision === "allow") title = "제어 요청 허용";
  return {
    eventId: record.session.eventId,
    occurredAt: new Date(record.generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
    title,
    detail: `${zone} · ${dwell}${record.vision.backgroundChanged ? " · 배경 변경" : ""}`,
    decision: record.safety.decision,
  };
}

export function recordsToDoorHubSnapshot(records: DoorHubEventRecord[]): DoorHubSnapshot | null {
  const [latest] = records;
  if (!latest) return null;
  return { ...latest, recentEvents: records.map(eventRecordSummary) };
}
