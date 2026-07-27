import {
  beginModuleSync,
  completeModuleSync,
  failModuleSync,
  markModuleEventsAcknowledged,
  saveModuleEvents,
} from "../storage/local-database";
import type { ModuleGateway, ModuleSyncStore } from "./contracts";
import { syncModuleEvents } from "./sync-service";

const mobileSyncStore: ModuleSyncStore = {
  begin: beginModuleSync,
  saveEvents: saveModuleEvents,
  markAcknowledged: markModuleEventsAcknowledged,
  complete: completeModuleSync,
  fail: failModuleSync,
};

export function syncConnectedModule(gateway: ModuleGateway) {
  return syncModuleEvents(gateway, mobileSyncStore);
}
