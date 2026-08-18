import type {
  PersonTrajectory,
  TrajectoryDecision,
  TrajectoryPoint,
  TrajectorySnapshot,
  TrajectoryZone,
} from "./trajectory-domain";

const validZones = new Set<TrajectoryZone>([
  "corridor_entry", "approach", "door_zone", "delivery_zone", "corridor_exit", "blind_side",
]);

interface FpgaPoint {
  tMs: number;
  xPermille: number;
  yPermille: number;
  zone: string;
}

interface FpgaMotionStatus {
  status: "ok";
  schemaVersion: "fpga-motion/1";
  deviceId: string;
  source: "arty-a7-100t";
  frameId: number;
  capturedMs: number;
  backgroundReady: boolean;
  completedFrames: number;
  invalidPackets: number;
  motionPixelCount: number;
  minMotionPixels: number;
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  track: {
    id: string;
    active: boolean;
    dwellMs: number;
    quickReturnSeconds: number | null;
    zone: string;
    centroid: { x: number; y: number };
    points: FpgaPoint[];
  };
  assessment: { decision: TrajectoryDecision; summary: string; criminalIntentDetermined: false };
  limitation: "motion_candidate_not_person_classification";
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("FPGA 응답 형식이 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function numberField(object: Record<string, unknown>, key: string) {
  const value = object[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`FPGA ${key} 값이 없습니다.`);
  return value;
}

function normalizeZone(value: string): TrajectoryZone {
  return validZones.has(value as TrajectoryZone) ? value as TrajectoryZone : "approach";
}

export function parseFpgaMotionStatus(value: unknown): FpgaMotionStatus {
  const root = asObject(value);
  if (root.status !== "ok" || root.schemaVersion !== "fpga-motion/1" || root.source !== "arty-a7-100t") {
    throw new Error("Arty A7 동선 응답이 아닙니다.");
  }
  const track = asObject(root.track);
  const bbox = asObject(root.bbox);
  const assessment = asObject(root.assessment);
  const centroid = asObject(track.centroid);
  const decision = assessment.decision;
  if (!["normal", "watch", "alert", "inconclusive"].includes(String(decision))) {
    throw new Error("FPGA 판정 값이 올바르지 않습니다.");
  }
  if (!Array.isArray(track.points)) throw new Error("FPGA 동선 좌표가 없습니다.");
  const points = track.points.map((item) => {
    const point = asObject(item);
    return {
      tMs: numberField(point, "tMs"),
      xPermille: numberField(point, "xPermille"),
      yPermille: numberField(point, "yPermille"),
      zone: String(point.zone ?? "approach"),
    };
  });
  return {
    status: "ok",
    schemaVersion: "fpga-motion/1",
    deviceId: String(root.deviceId),
    source: "arty-a7-100t",
    frameId: numberField(root, "frameId"),
    capturedMs: numberField(root, "capturedMs"),
    backgroundReady: Boolean(root.backgroundReady),
    completedFrames: numberField(root, "completedFrames"),
    invalidPackets: numberField(root, "invalidPackets"),
    motionPixelCount: numberField(root, "motionPixelCount"),
    minMotionPixels: numberField(root, "minMotionPixels"),
    bbox: {
      minX: numberField(bbox, "minX"), maxX: numberField(bbox, "maxX"),
      minY: numberField(bbox, "minY"), maxY: numberField(bbox, "maxY"),
    },
    track: {
      id: String(track.id), active: Boolean(track.active), dwellMs: numberField(track, "dwellMs"),
      quickReturnSeconds: track.quickReturnSeconds === null ? null : numberField(track, "quickReturnSeconds"),
      zone: String(track.zone),
      centroid: { x: numberField(centroid, "x"), y: numberField(centroid, "y") },
      points,
    },
    assessment: {
      decision: decision as TrajectoryDecision,
      summary: String(assessment.summary),
      criminalIntentDetermined: false,
    },
    limitation: "motion_candidate_not_person_classification",
  };
}

export function buildFpgaTrajectorySnapshot(status: FpgaMotionStatus): TrajectorySnapshot {
  const generatedAt = new Date().toISOString();
  const points: TrajectoryPoint[] = status.track.points.map((point) => ({
    tMs: point.tMs,
    x: Math.max(0, Math.min(1, point.xPermille / 1000)),
    y: Math.max(0, Math.min(1, point.yPermille / 1000)),
    zone: normalizeZone(point.zone),
  }));
  const track: PersonTrajectory | null = points.length === 0 ? null : {
    id: status.track.id,
    entryZone: points[0].zone,
    exitZone: status.track.active ? null : points.at(-1)?.zone ?? null,
    dwellMs: status.track.dwellMs,
    deliveryActionDetected: points.some((point) => point.zone === "delivery_zone"),
    returnedWithinSeconds: status.track.quickReturnSeconds,
    trackingConfidence: 0.5,
    points,
  };
  const score = { normal: 10, watch: 55, alert: 85, inconclusive: 0 }[status.assessment.decision];
  const reason = !status.backgroundReady ? "배경 준비 중" : `${status.motionPixelCount}개 움직임 픽셀`;
  return {
    mode: "fpga",
    scenarioId: "fpga-live",
    scenarioLabel: "Arty A7 실시간",
    generatedAt,
    observation: {
      id: `fpga-frame-${status.frameId}`,
      schemaVersion: "trajectory-observation/1",
      deviceId: status.deviceId,
      capturedAt: generatedAt,
      frame: { width: 160, height: 120 },
      counts: {
        entered: track ? 1 : 0,
        exited: track && !status.track.active ? 1 : 0,
        visible: status.track.active ? 1 : 0,
      },
      processedVideo: null,
      tracks: track ? [track] : [],
      isDemo: false,
    },
    assessment: {
      id: `fpga-assessment-${status.frameId}`,
      observationId: `fpga-frame-${status.frameId}`,
      decision: status.assessment.decision,
      anomalyScore: score,
      reasonCodes: [status.backgroundReady ? "fpga_motion_candidate" : "fpga_background_initializing"],
      reasons: [reason, `프레임 ${status.completedFrames}개 처리`, `손상 패킷 ${status.invalidPackets}개`],
      summary: status.assessment.summary,
      policyVersion: "fpga-motion-policy/0.1",
      evaluatedAt: generatedAt,
      isDemo: false,
      criminalIntentDetermined: false,
    },
    response: {
      message: status.assessment.decision === "alert" ? "사각지대 동선을 확인하세요." : "FPGA 동선 처리를 계속합니다.",
      actions: status.assessment.decision === "alert" ? ["사용자 확인"] : ["추적 유지"],
    },
    recentEvents: [{
      id: `fpga-event-${status.frameId}`,
      occurredAt: new Date().toLocaleTimeString("ko-KR", { hour12: false }),
      title: "Arty A7 움직임 처리",
      detail: `${status.motionPixelCount}개 픽셀 · ${status.track.zone}`,
      decision: status.assessment.decision,
    }],
  };
}
