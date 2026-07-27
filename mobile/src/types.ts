export type SensorValue = boolean | number | string;
export type RiskLevel = "pending" | "normal" | "watch" | "warning" | "critical";
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
  response: { status: "preview"; actions: string[]; message: string };
  recentEvents: EventLogItem[];
}
