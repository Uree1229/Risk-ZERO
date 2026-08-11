export type SensorValue = boolean | number | string;

export interface SensorReading<T extends SensorValue = SensorValue> {
  id: string;
  metric: string;
  label: string;
  value: T;
  unit?: string;
  quality: "good" | "degraded" | "unknown";
  capturedAt: string;
}

export interface SensorSource {
  provider: string;
  deviceId: string;
  transport: "demo" | "http" | "mqtt" | "serial" | "ble" | "other";
}

export interface SensorEvent {
  id: string;
  sequence: number;
  capturedAt: string;
  source: SensorSource;
  readings: SensorReading[];
}

export type RiskLevel = "pending" | "normal" | "watch" | "warning" | "critical";
export type VerificationDecision = "pending" | "pass" | "block" | "inconclusive";
export type CaptureQuality = "good" | "degraded" | "bad" | "missing";

export interface ControlRequest {
  id: string;
  deviceId: string;
  intent: "unlock" | "lock" | "status";
  transcript: string;
  asrConfidence: number | null;
  requestedAt: string;
  expiresAt: string;
  challengeId: string | null;
  nonce: string;
  challengePhrase?: string | null;
}

export interface VerificationEvidence {
  personPresent: boolean;
  faceCount: number;
  mouthVisible: boolean;
  audioDetected: boolean;
  avOffsetMs: number | null;
  syncConfidence: number | null;
  activeSpeakerScore: number | null;
  audioSpoofScore: number | null;
  visualSpoofScore: number | null;
  challengeMatched: boolean | null;
  audioQuality: CaptureQuality;
  videoQuality: CaptureQuality;
  clockSynchronized: boolean;
  modelVersions: Record<string, string>;
}

export interface VerificationResult {
  id: string;
  schemaVersion: "av-verification/1";
  decision: VerificationDecision;
  confidence: number | null;
  reasonCodes: string[];
  summary: string;
  policyVersion: string;
  evaluatedAt: string;
  processingTimeMs: number;
  isDemo: boolean;
  evidence: VerificationEvidence;
}

export interface ActuationGateResult {
  allowed: boolean;
  output: "unlock_pulse" | "lock_pulse" | "none";
  reason: string;
  validUntil: string;
}

/** Previous risk records remain readable during the topic migration. */
export interface RiskAssessment {
  status: "placeholder" | "demo";
  engine: string;
  algorithmVersion: null;
  score: number | null;
  level: RiskLevel;
  summary: string;
  reasons: string[];
  evaluatedAt: string;
}

export type ResponseAction = "standby" | "local_alert" | "camera_preview" | "guardian_notice" | "confirm_emergency_call";

export interface ResponsePlan {
  status: "preview";
  actions: ResponseAction[];
  message: string;
}

export interface PipelineStage {
  id: "capture" | "normalize" | "verify" | "gate";
  label: string;
  detail: string;
  state: "ready" | "demo" | "pending";
}

export interface EventLogItem {
  id: string;
  occurredAt: string;
  title: string;
  detail: string;
  decision: VerificationDecision;
  confidence: number | null;
  level: RiskLevel;
  score: number | null;
}

export interface SystemSnapshot {
  mode: "demo";
  scenarioId: string;
  scenarioLabel: string;
  generatedAt: string;
  controlRequest: ControlRequest;
  sensorEvent: SensorEvent;
  verification: VerificationResult;
  gate: ActuationGateResult;
  assessment: RiskAssessment;
  response: ResponsePlan;
  pipeline: PipelineStage[];
  recentEvents: EventLogItem[];
}

export interface SensorGateway {
  getLatest(): Promise<SensorEvent>;
}

export interface VerificationEngine {
  evaluate(event: SensorEvent, request: ControlRequest): Promise<VerificationResult>;
}
