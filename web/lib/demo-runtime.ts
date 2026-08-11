import type {
  CaptureQuality,
  EventLogItem,
  ResponseAction,
  RiskLevel,
  SensorReading,
  SystemSnapshot,
  VerificationDecision,
  VerificationEvidence,
} from "./domain";

interface DemoScenario {
  id: string;
  label: string;
  sequence: number;
  decision: Exclude<VerificationDecision, "pending">;
  confidence: number;
  summary: string;
  reasons: string[];
  reasonCodes: string[];
  evidence: VerificationEvidence;
  actions: ResponseAction[];
  message: string;
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
  modelVersions: { avSync: "DemoSyncAdapter/0.1", activeSpeaker: "DemoTalkAdapter/0.1", audioSpoof: "DemoSpoofAdapter/0.1" },
};

const scenarios: DemoScenario[] = [
  {
    id: "pass",
    label: "현장 발화 통과",
    sequence: 201,
    decision: "pass",
    confidence: 0.91,
    summary: "현재 발화와 입술 움직임이 일치합니다.",
    reasons: ["싱크 42ms", "활성 화자 확인", "challenge 일치"],
    reasonCodes: ["verified_live_speech"],
    evidence: baseEvidence,
    actions: ["standby"],
    message: "제어 요청을 3초 동안 허용합니다.",
  },
  {
    id: "audio-replay",
    label: "음성 재생 차단",
    sequence: 202,
    decision: "block",
    confidence: 0.97,
    summary: "화면에서 현재 발화자를 확인하지 못했습니다.",
    reasons: ["화면 속 발화자 없음", "재생 음성 의심"],
    reasonCodes: ["no_visible_person", "audio_spoof_suspected"],
    evidence: { ...baseEvidence, personPresent: false, faceCount: 0, mouthVisible: false, audioSpoofScore: 0.91 },
    actions: ["local_alert", "camera_preview"],
    message: "문 제어를 차단하고 사건을 기록했습니다.",
  },
  {
    id: "sync-mismatch",
    label: "싱크 불일치 차단",
    sequence: 203,
    decision: "block",
    confidence: 0.91,
    summary: "음성과 입술 움직임의 시간이 맞지 않습니다.",
    reasons: ["오프셋 640ms", "허용 범위 ±200ms 초과"],
    reasonCodes: ["av_sync_mismatch"],
    evidence: { ...baseEvidence, avOffsetMs: 640, syncConfidence: 0.96 },
    actions: ["local_alert"],
    message: "문 제어를 차단하고 재시도를 요청합니다.",
  },
  {
    id: "inconclusive",
    label: "판단 불가",
    sequence: 204,
    decision: "inconclusive",
    confidence: 0.38,
    summary: "입술 영역을 안정적으로 판독할 수 없습니다.",
    reasons: ["입술 가림", "영상 품질 부족"],
    reasonCodes: ["mouth_not_visible", "capture_quality_low"],
    evidence: { ...baseEvidence, mouthVisible: false, videoQuality: "bad" as CaptureQuality, syncConfidence: null, activeSpeakerScore: null },
    actions: ["camera_preview", "guardian_notice"],
    message: "문 제어를 유지하고 앱 확인을 요청합니다.",
  },
];

const history: EventLogItem[] = [
  { id: "av-event-4", occurredAt: "17:24:12", title: "현장 발화 통과", detail: "싱크 42ms · challenge 일치", decision: "pass", confidence: 0.91, level: "normal", score: 91 },
  { id: "av-event-3", occurredAt: "14:10:27", title: "음성 재생 차단", detail: "화면 속 발화자 없음", decision: "block", confidence: 0.97, level: "critical", score: 97 },
  { id: "av-event-2", occurredAt: "11:44:08", title: "판단 불가", detail: "입술 영역 판독 실패", decision: "inconclusive", confidence: 0.38, level: "watch", score: 38 },
  { id: "av-event-1", occurredAt: "09:31:44", title: "싱크 불일치 차단", detail: "오프셋 640ms", decision: "block", confidence: 0.91, level: "critical", score: 91 },
];

export const scenarioOptions = scenarios.map(({ id, label }) => ({ id, label }));

const aliases: Record<string, string> = { normal: "pass", watch: "inconclusive", warning: "sync-mismatch", critical: "audio-replay" };

function findScenario(id: string): DemoScenario {
  const normalized = aliases[id] ?? id;
  return scenarios.find((scenario) => scenario.id === normalized) ?? scenarios[0];
}

function legacyLevel(decision: VerificationDecision): RiskLevel {
  if (decision === "pass") return "normal";
  if (decision === "block") return "critical";
  if (decision === "inconclusive") return "watch";
  return "pending";
}

function metrics(scenario: DemoScenario, capturedAt: string): SensorReading[] {
  const evidence = scenario.evidence;
  return [
    { id: `${scenario.id}-face`, metric: "face_count", label: "얼굴 수", value: evidence.faceCount, unit: "명", quality: evidence.videoQuality === "good" ? "good" : "degraded", capturedAt },
    { id: `${scenario.id}-offset`, metric: "av_offset_ms", label: "시청각 오프셋", value: evidence.avOffsetMs ?? "측정 불가", ...(evidence.avOffsetMs === null ? {} : { unit: "ms" }), quality: evidence.clockSynchronized ? "good" : "degraded", capturedAt },
    { id: `${scenario.id}-sync`, metric: "sync_confidence", label: "싱크 신뢰도", value: evidence.syncConfidence === null ? "측정 불가" : Math.round(evidence.syncConfidence * 100), ...(evidence.syncConfidence === null ? {} : { unit: "%" }), quality: evidence.syncConfidence === null ? "degraded" : "good", capturedAt },
    { id: `${scenario.id}-spoof`, metric: "audio_spoof_score", label: "음성 위조 의심", value: evidence.audioSpoofScore === null ? "측정 불가" : Math.round(evidence.audioSpoofScore * 100), ...(evidence.audioSpoofScore === null ? {} : { unit: "%" }), quality: evidence.audioQuality === "good" ? "good" : "degraded", capturedAt },
  ];
}

export async function buildDemoSnapshot(scenarioId = "pass"): Promise<SystemSnapshot> {
  const scenario = findScenario(scenarioId);
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 15_000).toISOString();
  const validUntil = new Date(Date.now() + 3_000).toISOString();
  const requestId = `request-${scenario.id}`;
  const score = Math.round(scenario.confidence * 100);
  const level = legacyLevel(scenario.decision);
  return {
    mode: "demo",
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    generatedAt,
    controlRequest: {
      id: requestId,
      deviceId: "RZ-EDGE-DEMO-01",
      intent: "unlock",
      transcript: "초록 우산 문 열어",
      asrConfidence: 0.94,
      requestedAt: generatedAt,
      expiresAt,
      challengeId: `challenge-${scenario.id}`,
      nonce: `demo-nonce-${scenario.id}`,
      challengePhrase: "초록 우산 문 열어",
    },
    sensorEvent: {
      id: `demo-av-${scenario.id}-${scenario.sequence}`,
      sequence: scenario.sequence,
      capturedAt: generatedAt,
      source: { provider: "DemoAVEdgeGateway", deviceId: "RZ-EDGE-DEMO-01", transport: "demo" },
      readings: metrics(scenario, generatedAt),
    },
    verification: {
      id: `verification-${scenario.id}`,
      schemaVersion: "av-verification/1",
      decision: scenario.decision,
      confidence: scenario.confidence,
      reasonCodes: scenario.reasonCodes,
      summary: scenario.summary,
      policyVersion: "av-policy/0.1",
      evaluatedAt: generatedAt,
      processingTimeMs: 428,
      isDemo: true,
      evidence: scenario.evidence,
    },
    gate: {
      allowed: scenario.decision === "pass",
      output: scenario.decision === "pass" ? "unlock_pulse" : "none",
      reason: scenario.decision === "pass" ? "verified" : `verification_${scenario.decision}`,
      validUntil,
    },
    assessment: { status: "demo", engine: "VerificationCompatibilityAdapter", algorithmVersion: null, score, level, summary: scenario.summary, reasons: scenario.reasons, evaluatedAt: generatedAt },
    response: { status: "preview", actions: scenario.actions, message: scenario.message },
    pipeline: [
      { id: "capture", label: "카메라·마이크", detail: "동시 캡처와 타임스탬프", state: "pending" },
      { id: "normalize", label: "증거 정규화", detail: "av-verification/1 계약", state: "ready" },
      { id: "verify", label: "시청각 검증", detail: "결정론적 DEMO 어댑터", state: "demo" },
      { id: "gate", label: "제어 게이트", detail: "PASS만 3초간 허용", state: "demo" },
    ],
    recentEvents: history,
  };
}
