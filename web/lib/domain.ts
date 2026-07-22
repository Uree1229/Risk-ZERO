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

export type RiskLevel =
  | "pending"
  | "normal"
  | "watch"
  | "warning"
  | "critical";

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

export type ResponseAction =
  | "standby"
  | "local_alert"
  | "camera_preview"
  | "guardian_notice"
  | "confirm_emergency_call";

export interface ResponsePlan {
  status: "preview";
  actions: ResponseAction[];
  message: string;
}

export interface PipelineStage {
  id: "sensor" | "normalize" | "risk" | "response";
  label: string;
  detail: string;
  state: "ready" | "demo" | "pending";
}

export interface EventLogItem {
  id: string;
  occurredAt: string;
  title: string;
  detail: string;
  level: RiskLevel;
  score: number | null;
}

export interface SystemSnapshot {
  mode: "demo";
  scenarioId: string;
  scenarioLabel: string;
  generatedAt: string;
  sensorEvent: SensorEvent;
  assessment: RiskAssessment;
  response: ResponsePlan;
  pipeline: PipelineStage[];
  recentEvents: EventLogItem[];
}

/** Hardware/BLE/MQTT layers only need to implement this boundary. */
export interface SensorGateway {
  getLatest(): Promise<SensorEvent>;
}

/** Replace the demo implementation when the real algorithm is agreed. */
export interface RiskEngine {
  evaluate(event: SensorEvent): Promise<RiskAssessment>;
}

export interface ResponsePlanner {
  plan(assessment: RiskAssessment): Promise<ResponsePlan>;
}
