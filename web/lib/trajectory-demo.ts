import type {
  PersonTrajectory,
  TrajectoryAssessment,
  TrajectoryDecision,
  TrajectoryPoint,
  TrajectorySnapshot,
} from "./trajectory-domain";

interface ScenarioFixture {
  id: string;
  label: string;
  decision: TrajectoryDecision;
  score: number;
  summary: string;
  reasonCodes: string[];
  reasons: string[];
  response: string;
  actions: string[];
  counts: { entered: number; exited: number; visible: number };
  tracks: PersonTrajectory[];
}

function points(values: Array<[number, number, number, TrajectoryPoint["zone"]]>): TrajectoryPoint[] {
  return values.map(([tMs, x, y, zone]) => ({ tMs, x, y, zone }));
}

const normalPath = points([
  [0, 0.08, 0.86, "corridor_entry"],
  [2800, 0.22, 0.71, "approach"],
  [6100, 0.42, 0.56, "approach"],
  [9400, 0.57, 0.43, "door_zone"],
  [12800, 0.62, 0.58, "delivery_zone"],
  [17100, 0.39, 0.69, "approach"],
  [22100, 0.12, 0.87, "corridor_exit"],
]);

function track(overrides: Partial<PersonTrajectory> = {}): PersonTrajectory {
  return {
    id: "person-01",
    entryZone: "corridor_entry",
    exitZone: "corridor_exit",
    dwellMs: 22100,
    deliveryActionDetected: true,
    returnedWithinSeconds: null,
    trackingConfidence: 0.91,
    points: normalPath,
    ...overrides,
  };
}

const fixtures: ScenarioFixture[] = [
  {
    id: "normal-delivery",
    label: "정상 배송",
    decision: "normal",
    score: 14,
    summary: "물건을 내려놓은 뒤 정상 출구 방향으로 이탈했습니다.",
    reasonCodes: ["normal_delivery_exit"],
    reasons: ["진입 1명", "배송 구역 체류", "복도 방향 이탈"],
    response: "이벤트를 정상 배송으로 기록했습니다.",
    actions: ["기록 유지"],
    counts: { entered: 1, exited: 1, visible: 0 },
    tracks: [track()],
  },
  {
    id: "hidden-after-delivery",
    label: "배송 후 사각지대",
    decision: "alert",
    score: 90,
    summary: "배송 행동 이후 정상 출구가 아닌 사각지대 방향으로 이동했습니다.",
    reasonCodes: ["blind_zone_after_delivery"],
    reasons: ["배송 행동 감지", "사각지대 방향 이탈", "정상 이탈 미확인"],
    response: "앱 알림을 보내고 확인용 영상을 보존합니다.",
    actions: ["사용자 알림", "영상 확인"],
    counts: { entered: 1, exited: 0, visible: 0 },
    tracks: [track({
      exitZone: "blind_side",
      points: points([
        ...normalPath.slice(0, 5).map((point) => [point.tMs, point.x, point.y, point.zone] as [number, number, number, TrajectoryPoint["zone"]]),
        [16600, 0.78, 0.62, "blind_side"],
        [20500, 0.93, 0.57, "blind_side"],
      ]),
    })],
  },
  {
    id: "quick-return",
    label: "빠른 재접근",
    decision: "alert",
    score: 92,
    summary: "정상 이탈 뒤 38초 만에 같은 추적 세션이 다시 접근했습니다.",
    reasonCodes: ["quick_return"],
    reasons: ["38초 내 재접근", "복도 진입 방향 일치", "재확인 필요"],
    response: "재접근 이벤트를 분리 저장하고 사용자 확인을 요청합니다.",
    actions: ["사용자 알림", "실시간 확인"],
    counts: { entered: 2, exited: 1, visible: 1 },
    tracks: [track({
      returnedWithinSeconds: 38,
      dwellMs: 42100,
      points: [...normalPath, { tMs: 38000, x: 0.11, y: 0.86, zone: "corridor_entry" }, { tMs: 42100, x: 0.35, y: 0.66, zone: "approach" }],
    })],
  },
  {
    id: "multiple-persons",
    label: "인원 불일치",
    decision: "alert",
    score: 88,
    summary: "두 명이 진입했지만 정상 이탈이 확인되지 않았습니다.",
    reasonCodes: ["person_count_mismatch"],
    reasons: ["진입 2명", "이탈 0명", "화면 내 2명"],
    response: "다중 인원 이벤트로 기록하고 영상 확인을 요청합니다.",
    actions: ["사용자 알림", "영상 확인"],
    counts: { entered: 2, exited: 0, visible: 2 },
    tracks: [
      track({ exitZone: null }),
      track({
        id: "person-02",
        exitZone: null,
        deliveryActionDetected: false,
        dwellMs: 18000,
        trackingConfidence: 0.86,
        points: points([[0, 0.14, 0.91, "corridor_entry"], [6200, 0.31, 0.74, "approach"], [15000, 0.47, 0.68, "approach"]]),
      }),
    ],
  },
  {
    id: "long-dwell",
    label: "장시간 체류",
    decision: "watch",
    score: 68,
    summary: "현관 앞 체류시간이 45초 기준을 넘었습니다.",
    reasonCodes: ["long_dwell"],
    reasons: ["체류 72초", "정상 이탈 미확인"],
    response: "경계 이벤트로 기록하고 추적을 계속합니다.",
    actions: ["추적 유지"],
    counts: { entered: 1, exited: 0, visible: 1 },
    tracks: [track({ exitZone: null, dwellMs: 72000, points: points([[0, 0.09, 0.86, "corridor_entry"], [4500, 0.48, 0.51, "door_zone"], [72000, 0.51, 0.50, "door_zone"]]) })],
  },
  {
    id: "tracking-lost",
    label: "추적 불가",
    decision: "inconclusive",
    score: 50,
    summary: "가림 또는 프레임 손실로 동선을 안정적으로 계산하지 못했습니다.",
    reasonCodes: ["tracking_confidence_low"],
    reasons: ["추적 신뢰도 31%", "이탈 방향 미확인"],
    response: "위험 여부를 단정하지 않고 확인용 영상을 표시합니다.",
    actions: ["영상 확인"],
    counts: { entered: 1, exited: 0, visible: 0 },
    tracks: [track({ exitZone: null, trackingConfidence: 0.31, deliveryActionDetected: false, points: points([[0, 0.08, 0.86, "corridor_entry"], [2700, 0.23, 0.75, "approach"]]) })],
  },
];

export const trajectoryScenarioOptions = fixtures.map(({ id, label }) => ({ id, label }));

const recentEvents = [
  { id: "te-4", occurredAt: "17:41:22", title: "배송 후 사각지대", detail: "배송 후 우측 사각지대 이동", decision: "alert" as const },
  { id: "te-3", occurredAt: "15:08:04", title: "정상 배송", detail: "22초 체류 후 복도 이탈", decision: "normal" as const },
  { id: "te-2", occurredAt: "12:19:37", title: "빠른 재접근", detail: "이탈 38초 후 재진입", decision: "alert" as const },
  { id: "te-1", occurredAt: "09:52:10", title: "추적 불가", detail: "가림으로 이탈 방향 미확인", decision: "inconclusive" as const },
];

export async function buildTrajectorySnapshot(scenarioId = "normal-delivery"): Promise<TrajectorySnapshot> {
  const fixture = fixtures.find((item) => item.id === scenarioId) ?? fixtures[0];
  const generatedAt = new Date().toISOString();
  const observationId = `trajectory-${fixture.id}`;
  const assessment: TrajectoryAssessment = {
    id: `assessment-${fixture.id}`,
    observationId,
    decision: fixture.decision,
    anomalyScore: fixture.score,
    reasonCodes: fixture.reasonCodes,
    reasons: fixture.reasons,
    summary: fixture.summary,
    policyVersion: "trajectory-policy/0.1",
    evaluatedAt: generatedAt,
    isDemo: true,
    criminalIntentDetermined: false,
  };
  return {
    mode: "demo",
    scenarioId: fixture.id,
    scenarioLabel: fixture.label,
    generatedAt,
    observation: {
      id: observationId,
      schemaVersion: "trajectory-observation/1",
      deviceId: "ESP32-CAM-DEMO-01",
      capturedAt: generatedAt,
      frame: { width: 320, height: 240 },
      counts: fixture.counts,
      processedVideo: `clips/${fixture.id}.mp4`,
      tracks: fixture.tracks,
      isDemo: true,
    },
    assessment,
    response: { message: fixture.response, actions: fixture.actions },
    recentEvents,
  };
}
