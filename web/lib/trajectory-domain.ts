export type TrajectoryDecision = "normal" | "watch" | "alert" | "inconclusive";
export type TrajectoryZone = "corridor_entry" | "approach" | "door_zone" | "delivery_zone" | "corridor_exit" | "blind_side";

export interface TrajectoryPoint {
  tMs: number;
  x: number;
  y: number;
  zone: TrajectoryZone;
}

export interface PersonTrajectory {
  id: string;
  entryZone: TrajectoryZone;
  exitZone: TrajectoryZone | null;
  dwellMs: number;
  deliveryActionDetected: boolean;
  returnedWithinSeconds: number | null;
  trackingConfidence: number;
  points: TrajectoryPoint[];
}

export interface TrajectoryObservation {
  id: string;
  schemaVersion: "trajectory-observation/1";
  deviceId: string;
  capturedAt: string;
  frame: { width: number; height: number };
  counts: { entered: number; exited: number; visible: number };
  processedVideo: string | null;
  tracks: PersonTrajectory[];
  isDemo: boolean;
}

export interface TrajectoryAssessment {
  id: string;
  observationId: string;
  decision: TrajectoryDecision;
  anomalyScore: number;
  reasonCodes: string[];
  reasons: string[];
  summary: string;
  policyVersion: "trajectory-policy/0.1" | "fpga-motion-policy/0.1";
  evaluatedAt: string;
  isDemo: boolean;
  criminalIntentDetermined: false;
}

export interface TrajectoryEventItem {
  id: string;
  occurredAt: string;
  title: string;
  detail: string;
  decision: TrajectoryDecision;
}

export interface TrajectorySnapshot {
  mode: "demo" | "fpga";
  scenarioId: string;
  scenarioLabel: string;
  generatedAt: string;
  observation: TrajectoryObservation;
  assessment: TrajectoryAssessment;
  response: { message: string; actions: string[] };
  recentEvents: TrajectoryEventItem[];
}
