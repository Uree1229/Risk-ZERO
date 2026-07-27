import { MemoryModuleSyncStore } from "../module/memory-sync-store";
import type { ModuleDevice, ModuleEvent } from "../module/contracts";
import type { EventLogItem, SystemSnapshot } from "../types";
import { snapshotToEventLogItem } from "./event-log";

// Expo 웹 미리보기에서는 네이티브 SQLite 대신 화면 동작만 유지합니다.
// Android와 iOS 빌드에서는 local-database.native.ts가 자동으로 선택됩니다.
const webSyncStore = new MemoryModuleSyncStore();
const webEventItems = new Map<
  string,
  { capturedAt: string; item: EventLogItem }
>();

export async function initializeLocalDatabase() {
  return Promise.resolve();
}

export async function saveSnapshotLocally(snapshot: SystemSnapshot) {
  webEventItems.set(snapshot.sensorEvent.id, {
    capturedAt: snapshot.generatedAt,
    item: snapshotToEventLogItem(snapshot),
  });
}

export async function loadRecentEvents(limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be an integer between 1 and 100.");
  }

  return [...webEventItems.values()]
    .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
    .slice(0, limit)
    .map(({ item }) => ({ ...item }));
}

export function beginModuleSync(device: ModuleDevice) {
  return webSyncStore.begin(device);
}

export function saveModuleEvents(device: ModuleDevice, events: ModuleEvent[]) {
  return webSyncStore.saveEvents(device, events);
}

export function markModuleEventsAcknowledged(
  deviceId: string,
  sequence: number,
) {
  return webSyncStore.markAcknowledged(deviceId, sequence);
}

export function completeModuleSync(deviceId: string) {
  return webSyncStore.complete(deviceId);
}

export function failModuleSync(deviceId: string, message: string) {
  return webSyncStore.fail(deviceId, message);
}
