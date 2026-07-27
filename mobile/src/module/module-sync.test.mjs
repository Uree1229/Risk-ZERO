import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryModuleEventBuffer } from "./event-buffer.ts";
import { MemoryModuleSyncStore } from "./memory-sync-store.ts";
import { ModuleSyncError, syncModuleEvents } from "./sync-service.ts";

const device = {
  id: "RZ-MODULE-01",
  displayName: "현관 보조 도어락",
  provider: "ModuleBuffer",
  transport: "ble",
};

function draft(index) {
  const capturedAt = `2026-07-27T00:00:0${index}.000Z`;
  return {
    eventType: "presence",
    capturedAt,
    readings: [
      {
        id: `presence-${index}`,
        metric: "presence",
        label: "사람 감지",
        value: true,
        quality: "good",
        capturedAt,
      },
    ],
  };
}

test("동기화는 여러 배치를 저장한 후 마지막 순번까지 ACK한다", async () => {
  const moduleBuffer = new InMemoryModuleEventBuffer(device, 10);
  const store = new MemoryModuleSyncStore();
  moduleBuffer.append(draft(1));
  moduleBuffer.append(draft(2));
  moduleBuffer.append(draft(3));

  const result = await syncModuleEvents(moduleBuffer, store, { batchSize: 2 });

  assert.equal(result.receivedEventCount, 3);
  assert.equal(result.storedEventCount, 3);
  assert.equal(result.acknowledgedThroughSequence, 3);
  assert.equal(moduleBuffer.getStatus().retainedEventCount, 0);
  assert.deepEqual(store.getState(device.id), {
    deviceId: device.id,
    lastReceivedSequence: 3,
    lastAcknowledgedSequence: 3,
    status: "idle",
  });

  const repeated = await syncModuleEvents(moduleBuffer, store);
  assert.equal(repeated.receivedEventCount, 0);
  assert.equal(store.storedEventCount, 3);
});

test("저장 후 ACK가 실패하면 다음 연결에서 ACK만 재시도한다", async () => {
  const moduleBuffer = new InMemoryModuleEventBuffer(device, 10);
  const store = new MemoryModuleSyncStore();
  moduleBuffer.append(draft(1));
  let shouldFail = true;

  const unstableGateway = {
    getDevice: () => moduleBuffer.getDevice(),
    pullEvents: (afterSequence, limit) =>
      moduleBuffer.pullEvents(afterSequence, limit),
    acknowledgeThrough: async (sequence) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("BLE disconnected");
      }
      await moduleBuffer.acknowledgeThrough(sequence);
    },
  };

  await assert.rejects(() => syncModuleEvents(unstableGateway, store));
  assert.equal(store.getState(device.id)?.lastReceivedSequence, 1);
  assert.equal(store.getState(device.id)?.lastAcknowledgedSequence, 0);

  const resumed = await syncModuleEvents(unstableGateway, store);
  assert.equal(resumed.receivedEventCount, 0);
  assert.equal(resumed.acknowledgedThroughSequence, 1);
  assert.equal(store.storedEventCount, 1);
});

test("같은 dedupeKey를 다시 받아도 한 번만 저장한다", async () => {
  const moduleBuffer = new InMemoryModuleEventBuffer(device, 10);
  const store = new MemoryModuleSyncStore();
  moduleBuffer.append({ ...draft(1), dedupeKey: "same-sensor-event" });
  moduleBuffer.append({ ...draft(2), dedupeKey: "same-sensor-event" });

  const result = await syncModuleEvents(moduleBuffer, store);

  assert.equal(result.receivedEventCount, 2);
  assert.equal(result.storedEventCount, 1);
  assert.equal(result.acknowledgedThroughSequence, 2);
  assert.equal(store.storedEventCount, 1);
});

test("버퍼 용량 초과로 필요한 이벤트가 사라지면 데이터 유실로 판정한다", async () => {
  const moduleBuffer = new InMemoryModuleEventBuffer(device, 2);
  const store = new MemoryModuleSyncStore();
  moduleBuffer.append(draft(1));
  moduleBuffer.append(draft(2));
  moduleBuffer.append(draft(3));

  await assert.rejects(
    () => syncModuleEvents(moduleBuffer, store),
    (error) =>
      error instanceof ModuleSyncError && error.code === "BUFFER_GAP",
  );
  assert.equal(store.getState(device.id)?.status, "error");
  assert.equal(moduleBuffer.getStatus().droppedThroughSequence, 1);
});
