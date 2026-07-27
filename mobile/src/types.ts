export type SensorValue = boolean | number | string;
export type RiskLevel = "pending" | "normal" | "watch" | "warning" | "critical";

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
    source: { provider: string; deviceId: string; transport: string };
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
