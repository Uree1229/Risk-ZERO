import { MemoryModuleSyncStore } from "../module/memory-sync-store";
import type { ModuleDevice, ModuleEvent } from "../module/contracts";
import type { SystemSnapshot } from "../types";

// Expo 웹 미리보기에서는 네이티브 SQLite 대신 화면 동작만 유지합니다.
// Android와 iOS 빌드에서는 local-database.native.ts가 자동으로 선택됩니다.
const webSyncStore = new MemoryModuleSyncStore();

export async function initializeLocalDatabase() {
  return Promise.resolve();
}

export async function saveSnapshotLocally(_snapshot: SystemSnapshot) {
  return Promise.resolve();
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
