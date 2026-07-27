import type {
  ModuleEventBatch,
  ModuleGateway,
  ModuleSyncStore,
} from "./contracts";

export class ModuleSyncError extends Error {
  readonly code:
    | "DEVICE_MISMATCH"
    | "BUFFER_GAP"
    | "MODULE_RESET"
    | "INVALID_SEQUENCE";

  constructor(
    message: string,
    code:
      | "DEVICE_MISMATCH"
      | "BUFFER_GAP"
      | "MODULE_RESET"
      | "INVALID_SEQUENCE",
  ) {
    super(message);
    this.name = "ModuleSyncError";
    this.code = code;
  }
}

export interface ModuleSyncResult {
  deviceId: string;
  receivedEventCount: number;
  storedEventCount: number;
  acknowledgedThroughSequence: number;
}

function validateBatch(
  batch: ModuleEventBatch,
  deviceId: string,
  cursor: number,
) {
  if (batch.deviceId !== deviceId) {
    throw new ModuleSyncError(
      `Expected ${deviceId}, received ${batch.deviceId}.`,
      "DEVICE_MISMATCH",
    );
  }
  if (batch.latestSequence < cursor) {
    throw new ModuleSyncError(
      "The module sequence was reset behind the mobile cursor.",
      "MODULE_RESET",
    );
  }
  if (
    batch.acknowledgedThroughSequence > cursor ||
    batch.droppedThroughSequence > cursor
  ) {
    throw new ModuleSyncError(
      "The module no longer retains every event required by the mobile cursor.",
      "BUFFER_GAP",
    );
  }

  let expectedSequence = cursor + 1;
  for (const event of batch.events) {
    if (event.deviceId !== deviceId || event.sequence !== expectedSequence) {
      throw new ModuleSyncError(
        `Expected sequence ${expectedSequence}, received ${event.sequence}.`,
        "INVALID_SEQUENCE",
      );
    }
    expectedSequence += 1;
  }

  if (
    batch.events.length === 0 &&
    batch.latestSequence > cursor &&
    !batch.hasMore
  ) {
    throw new ModuleSyncError(
      "The module reports newer events but returned no readable event.",
      "BUFFER_GAP",
    );
  }
}

export async function syncModuleEvents(
  gateway: ModuleGateway,
  store: ModuleSyncStore,
  options: { batchSize?: number; maxBatches?: number } = {},
): Promise<ModuleSyncResult> {
  const batchSize = options.batchSize ?? 50;
  const maxBatches = options.maxBatches ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("batchSize must be a positive integer.");
  }
  if (!Number.isInteger(maxBatches) || maxBatches < 1) {
    throw new RangeError("maxBatches must be a positive integer.");
  }

  const device = await gateway.getDevice();
  let receivedEventCount = 0;
  let storedEventCount = 0;

  try {
    const state = await store.begin(device);
    let cursor = state.lastReceivedSequence;

    // 앱 저장 후 ACK 도중 연결이 끊긴 경우 ACK만 다시 보낸다.
    if (state.lastReceivedSequence > state.lastAcknowledgedSequence) {
      await gateway.acknowledgeThrough(state.lastReceivedSequence);
      await store.markAcknowledged(device.id, state.lastReceivedSequence);
    }

    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      const batch = await gateway.pullEvents(cursor, batchSize);
      validateBatch(batch, device.id, cursor);

      if (batch.events.length === 0) {
        await store.complete(device.id);
        return {
          deviceId: device.id,
          receivedEventCount,
          storedEventCount,
          acknowledgedThroughSequence: cursor,
        };
      }

      receivedEventCount += batch.events.length;
      storedEventCount += await store.saveEvents(device, batch.events);
      cursor = batch.events[batch.events.length - 1].sequence;

      // SQLite 저장이 끝난 다음에만 모듈의 이벤트 삭제를 허용한다.
      await gateway.acknowledgeThrough(cursor);
      await store.markAcknowledged(device.id, cursor);

      if (!batch.hasMore && cursor >= batch.latestSequence) {
        await store.complete(device.id);
        return {
          deviceId: device.id,
          receivedEventCount,
          storedEventCount,
          acknowledgedThroughSequence: cursor,
        };
      }
    }

    throw new Error("Module synchronization exceeded the batch safety limit.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.fail(device.id, message);
    throw error;
  }
}
