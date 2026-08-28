export type SensorValue = boolean | number | string;
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
export type EventCategory =
  | "unclassified"
  | "resident"
  | "visitor"
  | "delivery"
  | "suspicious"
  | "intrusion"
  | "other";

export interface EventReview {
  category: EventCategory;
  isFalseAlarm: boolean;
  isImportant: boolean;
  memo: string;
  reviewedAt?: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  watchEnabled: boolean;
  warningEnabled: boolean;
  criticalEnabled: boolean;
  cooldownMinutes: number;
}

export interface DeviceSummary {
  id: string;
  displayName: string;
  provider: string;
  transport: string;
  syncStatus: "idle" | "syncing" | "error";
  lastConnectedAt: string | null;
  lastSyncedAt: string;
  batteryPercent: number | null;
  storageUsedBytes: number | null;
  storageCapacityBytes: number | null;
}

export interface DeviceRegistrationInput {
  id: string;
  displayName: string;
  transport: "ble" | "wifi" | "serial" | "other";
}

export interface VideoStorageSummary {
  fileCount: number;
  totalBytes: number;
  limitBytes: number;
}

export interface SensorReading {
  id: string;
  metric: string;
  label: string;
  value: SensorValue;
  unit?: string;
  quality: "good" | "degraded" | "unknown";
  capturedAt: string;
}

export interface EventLogItem {
  id: string;
  capturedAt?: string;
  occurredAt: string;
  title: string;
  detail: string;
  level: RiskLevel;
  score: number | null;
  decision: VerificationDecision;
  confidence: number | null;
  reasonCodes?: string[];
  review?: EventReview;
  video?: {
    localUri: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    durationMs: number;
    checksumSha256?: string;
  };
}

export interface SystemSnapshot {
  mode: "demo";
  scenarioId: string;
  scenarioLabel: string;
  generatedAt: string;
  controlRequest: ControlRequest;
  sensorEvent: {
    id: string;
    source: {
      provider: string;
      deviceId: string;
      transport: string;
      batteryPercent?: number;
      storageUsedBytes?: number;
      storageCapacityBytes?: number;
    };
    readings: SensorReading[];
  };
  assessment: {
    status: "placeholder" | "demo";
    engine: string;
    algorithmVersion: null;
    score: number | null;
    level: RiskLevel;
    summary: string;
    reasons: string[];
  };
  verification: VerificationResult;
  gate: ActuationGateResult;
  response: { status: "preview"; actions: string[]; message: string };
  recentEvents: EventLogItem[];
}

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
