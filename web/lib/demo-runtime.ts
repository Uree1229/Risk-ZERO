import type {
  EventLogItem,
  PipelineStage,
  ResponseAction,
  ResponsePlan,
  RiskAssessment,
  RiskEngine,
  RiskLevel,
  SensorEvent,
  SensorGateway,
  SensorReading,
  SystemSnapshot,
} from "./domain";

interface DemoScenario {
  id: string;
  label: string;
  sequence: number;
  readings: Array<Omit<SensorReading, "id" | "capturedAt" | "quality">>;
  assessment: {
    score: number;
    level: Exclude<RiskLevel, "pending">;
    summary: string;
    reasons: string[];
  };
  actions: ResponseAction[];
  message: string;
}

const scenarios: DemoScenario[] = [
  {
    id: "normal",
    label: "정상 방문",
    sequence: 101,
    readings: [
      { metric: "presence", label: "사람 감지", value: true },
      { metric: "dwell_seconds", label: "체류 시간", value: 7, unit: "초" },
      { metric: "vibration_count", label: "진동 횟수", value: 0, unit: "회" },
      { metric: "door_state", label: "문 상태", value: "닫힘" },
    ],
    assessment: {
      score: 14,
      level: "normal",
      summary: "정상적인 짧은 방문으로 표시된 더미 결과입니다.",
      reasons: ["짧은 체류", "진동 없음"],
    },
    actions: ["standby"],
    message: "추가 대응 없이 대기합니다.",
  },
  {
    id: "watch",
    label: "주의 관찰",
    sequence: 102,
    readings: [
      { metric: "presence", label: "사람 감지", value: true },
      { metric: "dwell_seconds", label: "체류 시간", value: 28, unit: "초" },
      { metric: "vibration_count", label: "진동 횟수", value: 1, unit: "회" },
      { metric: "door_state", label: "문 상태", value: "닫힘" },
    ],
    assessment: {
      score: 46,
      level: "watch",
      summary: "현관 앞 체류가 길어진 상황을 재현합니다.",
      reasons: ["체류 시간 증가", "일회성 진동"],
    },
    actions: ["local_alert"],
    message: "실내 알림을 미리보기로 표시합니다.",
  },
  {
    id: "warning",
    label: "위험 징후",
    sequence: 103,
    readings: [
      { metric: "presence", label: "사람 감지", value: true },
      { metric: "dwell_seconds", label: "체류 시간", value: 49, unit: "초" },
      { metric: "vibration_count", label: "진동 횟수", value: 3, unit: "회" },
      { metric: "door_state", label: "문 상태", value: "닫힘" },
    ],
    assessment: {
      score: 68,
      level: "warning",
      summary: "카메라와 보호자 알림 흐름을 확인하는 더미 결과입니다.",
      reasons: ["장시간 체류", "반복 진동"],
    },
    actions: ["camera_preview", "guardian_notice"],
    message: "보조 카메라와 보호자 알림을 미리보기로 실행합니다.",
  },
  {
    id: "critical",
    label: "고위험 시연",
    sequence: 104,
    readings: [
      { metric: "presence", label: "사람 감지", value: true },
      { metric: "dwell_seconds", label: "체류 시간", value: 76, unit: "초" },
      { metric: "vibration_count", label: "진동 횟수", value: 7, unit: "회" },
      { metric: "door_state", label: "문 상태", value: "강한 충격 감지" },
    ],
    assessment: {
      score: 88,
      level: "critical",
      summary: "고위험 대응 화면을 확인하기 위한 고정 더미 값입니다.",
      reasons: ["장시간 체류", "반복적인 강한 진동", "문 주변 충격"],
    },
    actions: [
      "local_alert",
      "camera_preview",
      "guardian_notice",
      "confirm_emergency_call",
    ],
    message: "보호자 확인 후 신고하도록 안내합니다. 자동 신고는 실행하지 않습니다.",
  },
];

const history: EventLogItem[] = [
  { id: "event-5", occurredAt: "17:24:12", title: "정상 방문", detail: "7초 체류 · 진동 없음", level: "normal", score: 14 },
  { id: "event-4", occurredAt: "16:48:03", title: "복도 통행", detail: "3초 감지 · 문 조작 없음", level: "normal", score: 8 },
  { id: "event-3", occurredAt: "14:10:27", title: "주의 관찰", detail: "28초 체류 · 진동 1회", level: "watch", score: 46 },
  { id: "event-2", occurredAt: "09:31:44", title: "위험 징후", detail: "49초 체류 · 반복 진동", level: "warning", score: 68 },
  { id: "event-1", occurredAt: "02:16:09", title: "고위험 시연", detail: "고정된 테스트 시나리오", level: "critical", score: 88 },
];

export const scenarioOptions = scenarios.map(({ id, label }) => ({ id, label }));

function findScenario(id: string): DemoScenario {
  return scenarios.find((scenario) => scenario.id === id) ?? scenarios[0];
}

class DemoSensorGateway implements SensorGateway {
  constructor(private readonly scenario: DemoScenario) {}

  async getLatest(): Promise<SensorEvent> {
    const capturedAt = new Date().toISOString();
    return {
      id: `demo-${this.scenario.id}-${this.scenario.sequence}`,
      sequence: this.scenario.sequence,
      capturedAt,
      source: { provider: "DemoSensorGateway", deviceId: "RZ-DEMO-01", transport: "demo" },
      readings: this.scenario.readings.map((reading, index) => ({
        ...reading,
        id: `${this.scenario.id}-${index}`,
        quality: "good",
        capturedAt,
      })),
    };
  }
}

/** No formula: fixed fixture values only, so UI/API flows can be tested. */
class DemoPassThroughRiskEngine implements RiskEngine {
  constructor(private readonly scenario: DemoScenario) {}

  async evaluate(_event: SensorEvent): Promise<RiskAssessment> {
    return {
      status: "demo",
      engine: "DemoPassThroughRiskEngine",
      algorithmVersion: null,
      ...this.scenario.assessment,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

const pipeline: PipelineStage[] = [
  { id: "sensor", label: "센서 계층", detail: "교체 가능한 Gateway 인터페이스", state: "demo" },
  { id: "normalize", label: "데이터 정규화", detail: "공통 SensorEvent 모델", state: "ready" },
  { id: "risk", label: "위험도 엔진", detail: "로직 비움 · 고정 더미 결과", state: "pending" },
  { id: "response", label: "대응 미리보기", detail: "실제 장치 제어 없음", state: "demo" },
];

export async function buildDemoSnapshot(scenarioId = "normal"): Promise<SystemSnapshot> {
  const scenario = findScenario(scenarioId);
  const sensorGateway = new DemoSensorGateway(scenario);
  const riskEngine = new DemoPassThroughRiskEngine(scenario);
  const sensorEvent = await sensorGateway.getLatest();
  const assessment = await riskEngine.evaluate(sensorEvent);
  const response: ResponsePlan = { status: "preview", actions: scenario.actions, message: scenario.message };

  return {
    mode: "demo",
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    generatedAt: new Date().toISOString(),
    sensorEvent,
    assessment,
    response,
    pipeline,
    recentEvents: history,
  };
}
