import type {
  RiskLevel,
  DoorHubEventRecord,
  DoorHubSnapshot,
  SystemSnapshot,
  VerificationDecision,
  VerificationEvidence,
} from "./types";
import { recordsToDoorHubSnapshot, summarizeDoorHubRecord } from "./door-hub";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "";
const API_CONFIGURED = API_BASE_URL.length > 0;

interface ScenarioFixture {
  label: string;
  decision: Exclude<VerificationDecision, "pending">;
  confidence: number;
  summary: string;
  reasons: string[];
  reasonCodes: string[];
  evidence: VerificationEvidence;
  response: string;
}

const baseEvidence: VerificationEvidence = {
  personPresent: true,
  faceCount: 1,
  mouthVisible: true,
  audioDetected: true,
  avOffsetMs: 42,
  syncConfidence: 0.93,
  activeSpeakerScore: 0.91,
  audioSpoofScore: 0.08,
  visualSpoofScore: 0.05,
  challengeMatched: true,
  audioQuality: "good",
  videoQuality: "good",
  clockSynchronized: true,
  modelVersions: {
    avSync: "DemoSyncAdapter/0.1",
    activeSpeaker: "DemoTalkAdapter/0.1",
    audioSpoof: "DemoSpoofAdapter/0.1",
  },
};

const scenarioFixtures: Record<string, ScenarioFixture> = {
  pass: {
    label: "현장 발화 통과",
    decision: "pass",
    confidence: 0.91,
    summary: "현재 발화와 입술 움직임이 일치합니다.",
    reasons: ["싱크 42ms", "활성 화자 확인", "challenge 일치"],
    reasonCodes: ["verified_live_speech"],
    evidence: baseEvidence,
    response: "제어 요청을 3초 동안 허용합니다.",
  },
  "audio-replay": {
    label: "음성 재생 차단",
    decision: "block",
    confidence: 0.97,
    summary: "화면에서 현재 발화자를 확인하지 못했습니다.",
    reasons: ["화면 속 발화자 없음", "재생 음성 의심"],
    reasonCodes: ["no_visible_person", "audio_spoof_suspected"],
    evidence: { ...baseEvidence, personPresent: false, faceCount: 0, mouthVisible: false, audioSpoofScore: 0.91 },
    response: "문 제어를 차단하고 사건을 기록했습니다.",
  },
  "sync-mismatch": {
    label: "싱크 불일치 차단",
    decision: "block",
    confidence: 0.91,
    summary: "음성과 입술 움직임의 시간이 맞지 않습니다.",
    reasons: ["오프셋 640ms", "허용 범위 ±200ms 초과"],
    reasonCodes: ["av_sync_mismatch"],
    evidence: { ...baseEvidence, avOffsetMs: 640, syncConfidence: 0.96 },
    response: "문 제어를 차단하고 재시도를 요청합니다.",
  },
  inconclusive: {
    label: "판단 불가",
    decision: "inconclusive",
    confidence: 0.38,
    summary: "입술 영역을 안정적으로 판독할 수 없습니다.",
    reasons: ["입술 가림", "영상 품질 부족"],
    reasonCodes: ["mouth_not_visible", "capture_quality_low"],
    evidence: { ...baseEvidence, mouthVisible: false, videoQuality: "bad", syncConfidence: null, activeSpeakerScore: null },
    response: "문 제어를 유지하고 앱 확인을 요청합니다.",
  },
};

const aliases: Record<string, string> = {
  normal: "pass",
  watch: "inconclusive",
  warning: "sync-mismatch",
  critical: "audio-replay",
};

function legacyLevel(decision: VerificationDecision): RiskLevel {
  if (decision === "pass") return "normal";
  if (decision === "block") return "critical";
  if (decision === "inconclusive") return "watch";
  return "pending";
}

function fallbackSnapshot(requestedScenarioId: string): SystemSnapshot {
  const scenarioId = aliases[requestedScenarioId] ?? requestedScenarioId;
  const fixture = scenarioFixtures[scenarioId] ?? scenarioFixtures.pass;
  const currentTime = new Date();
  const now = currentTime.toISOString();
  const expiresAt = new Date(currentTime.getTime() + 15_000).toISOString();
  const validUntil = new Date(currentTime.getTime() + 3_000).toISOString();
  const atToday = (hour: number, minute: number) => {
    const date = new Date(currentTime);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const requestId = `request-${scenarioId}`;
  const eventId = `mobile-av-${scenarioId}`;
  const score = Math.round(fixture.confidence * 100);
  const level = legacyLevel(fixture.decision);
  return {
    mode: "demo",
    scenarioId,
    scenarioLabel: fixture.label,
    generatedAt: now,
    controlRequest: {
      id: requestId,
      deviceId: "RZ-EDGE-DEMO-01",
      intent: "unlock",
      transcript: "초록 우산 문 열어",
      asrConfidence: 0.94,
      requestedAt: now,
      expiresAt,
      challengeId: `challenge-${scenarioId}`,
      nonce: `demo-nonce-${scenarioId}`,
      challengePhrase: "초록 우산 문 열어",
    },
    sensorEvent: {
      id: eventId,
      source: {
        provider: "DemoAVEdgeGateway",
        deviceId: "RZ-EDGE-DEMO-01",
        transport: "demo",
        batteryPercent: 84,
        storageUsedBytes: 214 * 1024 * 1024,
        storageCapacityBytes: 2048 * 1024 * 1024,
      },
      readings: [
        { id: "face-count", metric: "face_count", label: "얼굴 수", value: fixture.evidence.faceCount, unit: "명", quality: fixture.evidence.videoQuality === "good" ? "good" : "degraded", capturedAt: now },
        { id: "av-offset", metric: "av_offset_ms", label: "시청각 오프셋", value: fixture.evidence.avOffsetMs ?? "측정 불가", unit: fixture.evidence.avOffsetMs === null ? undefined : "ms", quality: fixture.evidence.clockSynchronized ? "good" : "degraded", capturedAt: now },
        { id: "sync", metric: "sync_confidence", label: "싱크 신뢰도", value: fixture.evidence.syncConfidence === null ? "측정 불가" : Math.round(fixture.evidence.syncConfidence * 100), unit: fixture.evidence.syncConfidence === null ? undefined : "%", quality: fixture.evidence.syncConfidence === null ? "degraded" : "good", capturedAt: now },
        { id: "spoof", metric: "audio_spoof_score", label: "음성 위조 의심", value: fixture.evidence.audioSpoofScore === null ? "측정 불가" : Math.round(fixture.evidence.audioSpoofScore * 100), unit: fixture.evidence.audioSpoofScore === null ? undefined : "%", quality: fixture.evidence.audioQuality === "good" ? "good" : "degraded", capturedAt: now },
      ],
    },
    assessment: { status: "demo", engine: "VerificationCompatibilityAdapter", algorithmVersion: null, score, level, summary: fixture.summary, reasons: fixture.reasons },
    verification: {
      id: `verification-${scenarioId}`,
      schemaVersion: "av-verification/1",
      decision: fixture.decision,
      confidence: fixture.confidence,
      reasonCodes: fixture.reasonCodes,
      summary: fixture.summary,
      policyVersion: "av-policy/0.1",
      evaluatedAt: now,
      processingTimeMs: 428,
      isDemo: true,
      evidence: fixture.evidence,
    },
    gate: {
      allowed: fixture.decision === "pass",
      output: fixture.decision === "pass" ? "unlock_pulse" : "none",
      reason: fixture.decision === "pass" ? "verified" : `verification_${fixture.decision}`,
      validUntil,
    },
    response: { status: "preview", actions: fixture.decision === "pass" ? ["standby"] : ["guardian_notice"], message: fixture.response },
    recentEvents: [
      { id: "av-m1", capturedAt: atToday(17, 24), occurredAt: "17:24", title: "현장 발화 통과", detail: "싱크 42ms · challenge 일치", level: "normal", score: 91, decision: "pass", confidence: 0.91, reasonCodes: ["verified_live_speech"] },
      { id: "av-m2", capturedAt: atToday(14, 10), occurredAt: "14:10", title: "음성 재생 차단", detail: "화면 속 발화자 없음", level: "critical", score: 97, decision: "block", confidence: 0.97, reasonCodes: ["no_visible_person"] },
      { id: "av-m3", capturedAt: atToday(11, 44), occurredAt: "11:44", title: "판단 불가", detail: "입술 영역 판독 실패", level: "watch", score: 38, decision: "inconclusive", confidence: 0.38, reasonCodes: ["mouth_not_visible"] },
      { id: "av-m4", capturedAt: atToday(9, 31), occurredAt: "09:31", title: "싱크 불일치 차단", detail: "오프셋 640ms", level: "critical", score: 91, decision: "block", confidence: 0.91, reasonCodes: ["av_sync_mismatch"] },
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

function doorHubFallback(scenarioId = "delivery"): DoorHubSnapshot {
  const generatedAt = new Date().toISOString();
  const base: DoorHubEventRecord = {
    schemaVersion: "door-hub-event/1",
    mode: "demo",
    scenarioId,
    generatedAt,
    deviceId: "RZ-DOOR-HUB-DEMO-01",
    session: { eventId: 1042, stage: "result-ready", pirActive: false, startedAt: new Date(Date.now() - 21_000).toISOString(), endedAt: new Date(Date.now() - 1_000).toISOString() },
    vision: { status: "ready", visitorPresent: false, objectCount: 0, primaryZone: 6, zoneMask: 32, dwellMs: 18_200, backgroundChangeRatio: 0.12, backgroundChanged: true, snapshotReady: true, snapshotRef: null },
    safety: { heartbeatOk: true, authArmed: false, decision: "none", blockReason: null, faultLatched: false, doorClosed: true, tamperDetected: false, emergencyStop: false, outputTarget: "led", outputActive: false },
  };
  if (scenarioId === "lingering") {
    base.session = { ...base.session, eventId: 1043, stage: "capture", pirActive: true, endedAt: null };
    base.vision = { ...base.vision, status: "capturing", visitorPresent: true, objectCount: 1, primaryZone: 8, zoneMask: 128, dwellMs: 67_400, backgroundChangeRatio: 0.02, backgroundChanged: false, snapshotReady: false };
  } else if (scenarioId === "return") {
    base.session = { ...base.session, eventId: 1044 };
    base.vision = { ...base.vision, visitorPresent: true, objectCount: 1, primaryZone: 2, zoneMask: 34, dwellMs: 29_800 };
    base.safety = { ...base.safety, decision: "block", blockReason: "reentry_review" };
  } else if (scenarioId === "safety-abort") {
    base.session = { ...base.session, eventId: 1045, stage: "fault" };
    base.vision = { ...base.vision, status: "fault", snapshotReady: false };
    base.safety = { ...base.safety, decision: "abort", blockReason: "tamper_detected", faultLatched: true, tamperDetected: true };
  }
  const previous: DoorHubEventRecord = {
    ...base,
    scenarioId: "previous",
    generatedAt: new Date(Date.now() - 86 * 60_000).toISOString(),
    session: { ...base.session, eventId: 1041, stage: "result-ready", pirActive: false },
    vision: { ...base.vision, status: "ready", visitorPresent: false, objectCount: 0, primaryZone: 2, dwellMs: 11_000, backgroundChanged: false },
    safety: { ...base.safety, decision: "none", blockReason: null, faultLatched: false, tamperDetected: false },
  };
  return { ...base, recentEvents: [summarizeDoorHubRecord(base), summarizeDoorHubRecord(previous)] };
}

export async function getDoorHubSnapshot(scenarioId: string): Promise<{ snapshot: DoorHubSnapshot; source: "api" | "fallback" }> {
  if (!API_CONFIGURED) return { snapshot: doorHubFallback(scenarioId), source: "fallback" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(`${API_BASE_URL}/api/door-hub-events?limit=20`, { signal: controller.signal });
    if (!response.ok) throw new Error("Door Hub API unavailable");
    const payload = await response.json() as { data?: DoorHubEventRecord[] };
    const snapshot = recordsToDoorHubSnapshot(payload.data ?? []);
    if (!snapshot) throw new Error("Door Hub event not found");
    return { snapshot, source: "api" };
  } catch {
    return { snapshot: doorHubFallback(scenarioId), source: "fallback" };
  } finally {
    clearTimeout(timeout);
  }
}
