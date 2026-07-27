export type ModuleTransport = "ble" | "wifi" | "serial" | "demo" | "other";

export interface ModuleDevice {
  id: string;
  displayName: string;
  provider: string;
  transport: ModuleTransport;
}

export interface ModuleEventDraft {
  eventType: string;
  capturedAt: string;
  metrics: ProcessedMetric[];
  video?: ProcessedVideoFile;
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
 * 하드웨어 어댑터가 앱 저장소로 전송을 끝낸 후 넘기는 영상 정보입니다.
 * SQLite에는 영상 바이트가 아니라 이 메타데이터와 localUri만 저장합니다.
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
