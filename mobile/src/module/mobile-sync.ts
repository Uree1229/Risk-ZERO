import {
  beginModuleSync,
  completeModuleSync,
  deleteProcessedVideoRecord,
  failModuleSync,
  listStoredVideoRecords,
  markModuleEventsAcknowledged,
  saveModuleEvents,
} from "../storage/local-database";
import {
  deleteStoredVideo,
  storeProcessedVideo,
} from "../media/processed-video-storage";
import {
  DEFAULT_VIDEO_STORAGE_LIMIT_BYTES,
  selectVideosForRemoval,
} from "../media/video-retention";
import type {
  ModuleEvent,
  ModuleGateway,
  ModuleSyncStore,
} from "./contracts";
import { syncModuleEvents } from "./sync-service";

async function prepareModuleEvents(events: ModuleEvent[]) {
  const preparedEvents: ModuleEvent[] = [];
  const newlyStoredUris: string[] = [];
  try {
    for (const event of events) {
      if (!event.video) {
        preparedEvents.push(event);
        continue;
      }
      const stored = await storeProcessedVideo(event.id, event.video);
      if (stored.newlyStored) newlyStoredUris.push(stored.video.localUri);
      preparedEvents.push({ ...event, video: stored.video });
    }
    return { preparedEvents, newlyStoredUris };
  } catch (error) {
    for (const localUri of newlyStoredUris) deleteStoredVideo(localUri);
    throw error;
  }
}

async function enforceVideoStorageLimit() {
  const records = await listStoredVideoRecords();
  const removals = selectVideosForRemoval(
    records,
    DEFAULT_VIDEO_STORAGE_LIMIT_BYTES,
  );
  for (const record of removals) {
    deleteStoredVideo(record.localUri);
    await deleteProcessedVideoRecord(record.id);
  }
}

const mobileSyncStore: ModuleSyncStore = {
  begin: beginModuleSync,
  saveEvents: async (device, events) => {
    const { preparedEvents, newlyStoredUris } = await prepareModuleEvents(events);
    try {
      const storedCount = await saveModuleEvents(device, preparedEvents);
      await enforceVideoStorageLimit();
      return storedCount;
    } catch (error) {
      for (const localUri of newlyStoredUris) deleteStoredVideo(localUri);
      throw error;
    }
  },
  markAcknowledged: markModuleEventsAcknowledged,
  complete: completeModuleSync,
  fail: failModuleSync,
};

export function syncConnectedModule(gateway: ModuleGateway) {
  return syncModuleEvents(gateway, mobileSyncStore);
}
