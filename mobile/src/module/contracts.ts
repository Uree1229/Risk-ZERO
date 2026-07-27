import type { SensorReading } from "../types";

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
  readings: SensorReading[];
  dedupeKey?: string;
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
