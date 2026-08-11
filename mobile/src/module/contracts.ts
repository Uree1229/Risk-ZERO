import type {
  ActuationGateResult,
  ControlRequest,
  VerificationResult,
} from "../types";

export type ModuleTransport = "ble" | "wifi" | "serial" | "demo" | "other";

export interface ModuleDevice {
  id: string;
  displayName: string;
  provider: string;
  transport: ModuleTransport;
  batteryPercent?: number;
  storageUsedBytes?: number;
  storageCapacityBytes?: number;
}

export interface ModuleEventDraft {
  eventType: string;
  capturedAt: string;
  metrics: ProcessedMetric[];
  video?: ProcessedVideoFile;
  controlRequest?: ControlRequest;
  verification?: VerificationResult;
  actuation?: ActuationGateResult;
  dedupeKey?: string;
}

export interface ProcessedMetric {
  id: string;
  metric: string;
  label: string;
  value: number;
  unit?: string;
  quality: "good" | "degraded" | "unknown";
  capturedAt: string;
}

/**
 * 하드웨어 어댑터가 모바일이 읽을 수 있는 임시 경로로 전송한 영상 정보입니다.
 * 동기화 계층은 파일을 앱 전용 저장소로 복사한 뒤 최종 localUri만 SQLite에 저장합니다.
 */
export interface ProcessedVideoFile {
  id: string;
  fileName: string;
  localUri: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  checksumSha256?: string;
  capturedAt: string;
}

export interface ModuleEvent extends ModuleEventDraft {
  id: string;
  deviceId: string;
  sequence: number;
  dedupeKey: string;
}

export interface ModuleEventBatch {
  deviceId: string;
  events: ModuleEvent[];
  oldestAvailableSequence: number;
  latestSequence: number;
  acknowledgedThroughSequence: number;
  droppedThroughSequence: number;
  hasMore: boolean;
}

export interface ModuleBufferStatus {
  capacity: number;
  retainedEventCount: number;
  latestSequence: number;
  acknowledgedThroughSequence: number;
  droppedThroughSequence: number;
}

/**
 * BLE, Wi-Fi 또는 실제 하드웨어 계층이 구현해야 하는 최소 계약입니다.
 */
export interface ModuleGateway {
  getDevice(): Promise<ModuleDevice>;
  pullEvents(afterSequence: number, limit: number): Promise<ModuleEventBatch>;
  acknowledgeThrough(sequence: number): Promise<void>;
}

export interface ModuleSyncState {
  deviceId: string;
  lastReceivedSequence: number;
  lastAcknowledgedSequence: number;
  status: "idle" | "syncing" | "error";
}

export interface ModuleSyncStore {
  begin(device: ModuleDevice): Promise<ModuleSyncState>;
  saveEvents(device: ModuleDevice, events: ModuleEvent[]): Promise<number>;
  markAcknowledged(deviceId: string, sequence: number): Promise<void>;
  complete(deviceId: string): Promise<void>;
  fail(deviceId: string, message: string): Promise<void>;
}
