import type {
  ModuleDevice,
  ModuleEvent,
  ModuleSyncState,
  ModuleSyncStore,
} from "./contracts";

export class MemoryModuleSyncStore implements ModuleSyncStore {
  private readonly states = new Map<string, ModuleSyncState>();
  private readonly eventKeys = new Set<string>();

  async begin(device: ModuleDevice) {
    const current = this.states.get(device.id) ?? {
      deviceId: device.id,
      lastReceivedSequence: 0,
      lastAcknowledgedSequence: 0,
      status: "idle" as const,
    };
    const syncing = { ...current, status: "syncing" as const };
    this.states.set(device.id, syncing);
    return { ...syncing };
  }

  async saveEvents(device: ModuleDevice, events: ModuleEvent[]) {
    let stored = 0;
    let lastReceived = this.states.get(device.id)?.lastReceivedSequence ?? 0;

    for (const event of events) {
      const key = `${event.deviceId}:${event.dedupeKey}`;
      if (!this.eventKeys.has(key)) {
        this.eventKeys.add(key);
        stored += 1;
      }
      lastReceived = Math.max(lastReceived, event.sequence);
    }

    const current = this.states.get(device.id);
    this.states.set(device.id, {
      deviceId: device.id,
      lastReceivedSequence: lastReceived,
      lastAcknowledgedSequence: current?.lastAcknowledgedSequence ?? 0,
      status: "syncing",
    });
    return stored;
  }

  async markAcknowledged(deviceId: string, sequence: number) {
    const current = this.requireState(deviceId);
    this.states.set(deviceId, {
      ...current,
      lastAcknowledgedSequence: Math.max(
        current.lastAcknowledgedSequence,
        sequence,
      ),
    });
  }

  async complete(deviceId: string) {
    const current = this.requireState(deviceId);
    this.states.set(deviceId, { ...current, status: "idle" });
  }

  async fail(deviceId: string, _message: string) {
    const current = this.states.get(deviceId);
    if (current) this.states.set(deviceId, { ...current, status: "error" });
  }

  getState(deviceId: string) {
    const state = this.states.get(deviceId);
    return state ? { ...state } : null;
  }

  get storedEventCount() {
    return this.eventKeys.size;
  }

  private requireState(deviceId: string) {
    const state = this.states.get(deviceId);
    if (!state) throw new Error(`Sync state not found for ${deviceId}.`);
    return state;
  }
}
