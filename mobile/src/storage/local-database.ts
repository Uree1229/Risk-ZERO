import { MemoryModuleSyncStore } from "../module/memory-sync-store";
import type { ModuleDevice, ModuleEvent } from "../module/contracts";
import {
  DEFAULT_VIDEO_STORAGE_LIMIT_BYTES,
  type StoredVideoRecord,
} from "../media/video-retention";
import type {
  DeviceRegistrationInput,
  DeviceSummary,
  EventLogItem,
  EventReview,
  NotificationPreferences,
  SystemSnapshot,
  VideoStorageSummary,
} from "../types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../notifications/notification-policy";
import { snapshotToEventLogItem } from "./event-log";

// Expo 웹 미리보기에서는 네이티브 SQLite 대신 화면 동작만 유지합니다.
// Android와 iOS 빌드에서는 local-database.native.ts가 자동으로 선택됩니다.
const webSyncStore = new MemoryModuleSyncStore();
const webEventItems = new Map<
  string,
  { capturedAt: string; item: EventLogItem }
>();
const webVideoRecords = new Map<string, StoredVideoRecord>();
const webVideoDeviceIds = new Map<string, string>();
const webDevices = new Map<string, DeviceSummary>();
const webNotificationDeliveries = new Map<
  string,
  { level: string; status: string; createdAt: string }
>();
let webNotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };

export async function initializeLocalDatabase() {
  return Promise.resolve();
}

export async function saveSnapshotLocally(snapshot: SystemSnapshot) {
  const source = snapshot.sensorEvent.source;
  webDevices.set(source.deviceId, {
    id: source.deviceId,
    displayName: source.deviceId,
    provider: source.provider,
    transport: source.transport,
    syncStatus: "idle",
    lastConnectedAt: snapshot.generatedAt,
    lastSyncedAt: snapshot.generatedAt,
    batteryPercent: source.batteryPercent ?? null,
    storageUsedBytes: source.storageUsedBytes ?? null,
    storageCapacityBytes: source.storageCapacityBytes ?? null,
  });
  webEventItems.set(snapshot.sensorEvent.id, {
    capturedAt: snapshot.generatedAt,
    item: snapshotToEventLogItem(snapshot),
  });
  for (const event of snapshot.recentEvents) {
    webEventItems.set(event.id, {
      capturedAt: event.capturedAt ?? snapshot.generatedAt,
      item: {
        ...event,
        capturedAt: event.capturedAt ?? snapshot.generatedAt,
      },
    });
  }
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

export async function saveEventReview(eventId: string, review: EventReview) {
  const stored = webEventItems.get(eventId);
  if (!stored) throw new Error(`Event not found: ${eventId}`);
  const savedReview = {
    ...review,
    memo: review.memo.trim(),
    reviewedAt: new Date().toISOString(),
  };
  webEventItems.set(eventId, {
    ...stored,
    item: { ...stored.item, review: savedReview },
  });
  return savedReview;
}

export function beginModuleSync(device: ModuleDevice) {
  const now = new Date().toISOString();
  webDevices.set(device.id, {
    id: device.id,
    displayName: device.displayName,
    provider: device.provider,
    transport: device.transport,
    syncStatus: "syncing",
    lastConnectedAt: now,
    lastSyncedAt: now,
    batteryPercent: device.batteryPercent ?? null,
    storageUsedBytes: device.storageUsedBytes ?? null,
    storageCapacityBytes: device.storageCapacityBytes ?? null,
  });
  return webSyncStore.begin(device);
}

export async function saveModuleEvents(
  device: ModuleDevice,
  events: ModuleEvent[],
) {
  const storedCount = await webSyncStore.saveEvents(device, events);
  for (const event of events) {
    if (!event.video) continue;
    webVideoRecords.set(event.video.id, {
      id: event.video.id,
      localUri: event.video.localUri,
      sizeBytes: event.video.sizeBytes,
      capturedAt: event.video.capturedAt,
    });
    webVideoDeviceIds.set(event.video.id, event.deviceId);
  }
  return storedCount;
}

export async function listStoredVideoRecords() {
  return [...webVideoRecords.values()].map((record) => ({ ...record }));
}

export async function deleteProcessedVideoRecord(videoId: string) {
  webVideoRecords.delete(videoId);
  webVideoDeviceIds.delete(videoId);
}

export async function loadVideoStorageSummary(): Promise<VideoStorageSummary> {
  return {
    fileCount: webVideoRecords.size,
    totalBytes: [...webVideoRecords.values()].reduce(
      (total, record) => total + record.sizeBytes,
      0,
    ),
    limitBytes: DEFAULT_VIDEO_STORAGE_LIMIT_BYTES,
  };
}

export async function loadNotificationPreferences() {
  return { ...webNotificationPreferences };
}

export async function saveNotificationPreferences(
  preferences: NotificationPreferences,
) {
  webNotificationPreferences = { ...preferences };
}

export async function reserveRiskNotification(
  eventId: string,
  level: string,
  cooldownMinutes: number,
) {
  if (webNotificationDeliveries.has(eventId)) return false;
  const latest = [...webNotificationDeliveries.values()]
    .filter((delivery) => delivery.level === level)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const now = new Date();
  if (
    latest &&
    now.getTime() - new Date(latest.createdAt).getTime() <
      cooldownMinutes * 60_000
  ) {
    return false;
  }
  webNotificationDeliveries.set(eventId, {
    level,
    status: "reserved",
    createdAt: now.toISOString(),
  });
  return true;
}

export async function markRiskNotificationDelivered(
  eventId: string,
  _notificationIdentifier: string,
) {
  const current = webNotificationDeliveries.get(eventId);
  if (current) {
    webNotificationDeliveries.set(eventId, {
      ...current,
      status: "delivered",
    });
  }
}

export async function releaseRiskNotification(eventId: string) {
  if (webNotificationDeliveries.get(eventId)?.status === "reserved") {
    webNotificationDeliveries.delete(eventId);
  }
}

export async function acknowledgeRiskNotification(eventId: string) {
  const current = webNotificationDeliveries.get(eventId);
  if (current) {
    webNotificationDeliveries.set(eventId, {
      ...current,
      status: "acknowledged",
    });
  }
}

export async function loadDevices() {
  return [...webDevices.values()]
    .sort((left, right) => right.lastSyncedAt.localeCompare(left.lastSyncedAt))
    .map((device) => ({ ...device }));
}

export async function registerDeviceLocally(
  input: DeviceRegistrationInput,
): Promise<DeviceSummary> {
  const id = input.id.trim();
  const displayName = input.displayName.trim();
  if (!id || !displayName) {
    throw new Error("장치 ID와 이름을 입력해 주세요.");
  }
  const now = new Date().toISOString();
  const device: DeviceSummary = {
    id,
    displayName,
    provider: "ManualRegistration",
    transport: input.transport,
    syncStatus: "idle",
    lastConnectedAt: null,
    lastSyncedAt: now,
    batteryPercent: null,
    storageUsedBytes: null,
    storageCapacityBytes: null,
  };
  webDevices.set(id, device);
  return { ...device };
}

export async function listDeviceStoredVideoRecords(deviceId: string) {
  return [...webVideoRecords.values()]
    .filter((record) => webVideoDeviceIds.get(record.id) === deviceId)
    .map((record) => ({ ...record }));
}

export async function deleteDeviceRecord(deviceId: string) {
  webDevices.delete(deviceId);
  for (const [videoId, storedDeviceId] of webVideoDeviceIds) {
    if (storedDeviceId === deviceId) {
      webVideoDeviceIds.delete(videoId);
      webVideoRecords.delete(videoId);
    }
  }
}

export function markModuleEventsAcknowledged(
  deviceId: string,
  sequence: number,
) {
  return webSyncStore.markAcknowledged(deviceId, sequence);
}

export async function completeModuleSync(deviceId: string) {
  await webSyncStore.complete(deviceId);
  const device = webDevices.get(deviceId);
  if (device) {
    webDevices.set(deviceId, {
      ...device,
      syncStatus: "idle",
      lastSyncedAt: new Date().toISOString(),
    });
  }
}

export async function failModuleSync(deviceId: string, message: string) {
  await webSyncStore.fail(deviceId, message);
  const device = webDevices.get(deviceId);
  if (device) {
    webDevices.set(deviceId, {
      ...device,
      syncStatus: "error",
      lastSyncedAt: new Date().toISOString(),
    });
  }
}
