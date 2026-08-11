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
    metrics: [
      {
        id: `dwell-${index}`,
        metric: "dwell_seconds",
        label: "체류 시간",
        value: index * 10,
        unit: "초",
        quality: "good",
        capturedAt,
      },
    ],
    video: {
      id: `video-${index}`,
      fileName: `entrance-${index}.mp4`,
      localUri: `file:///risk-zero/entrance-${index}.mp4`,
      mimeType: "video/mp4",
      sizeBytes: 1024 * index,
      durationMs: 3000,
      capturedAt,
    },
  };
}

test("모듈 버퍼는 후처리 수치와 영상 파일 정보만 전달한다", async () => {
  const moduleBuffer = new InMemoryModuleEventBuffer(device, 10);
  moduleBuffer.append(draft(1));

  const batch = await moduleBuffer.pullEvents(0, 10);

  assert.equal(batch.events[0].metrics[0].value, 10);
  assert.equal(batch.events[0].video.localUri, "file:///risk-zero/entrance-1.mp4");
  assert.equal("readings" in batch.events[0], false);
});

test("모듈 버퍼는 제어 요청과 시청각 검증 결과를 함께 전달한다", async () => {
  const moduleBuffer = new InMemoryModuleEventBuffer(device, 10);
  const capturedAt = "2026-08-11T01:30:21.000Z";
  moduleBuffer.append({
    ...draft(1),
    controlRequest: {
      id: "request-1",
      deviceId: device.id,
      intent: "unlock",
      transcript: "초록 우산 문 열어",
      asrConfidence: 0.94,
      requestedAt: capturedAt,
      expiresAt: "2026-08-11T01:30:36.000Z",
      challengeId: "challenge-1",
      nonce: "nonce-1",
    },
    verification: {
      id: "verification-1",
      schemaVersion: "av-verification/1",
      decision: "pass",
      confidence: 0.91,
      reasonCodes: ["verified_live_speech"],
      summary: "현재 발화와 입술 움직임이 일치합니다.",
      policyVersion: "av-policy/0.1",
      evaluatedAt: capturedAt,
      processingTimeMs: 428,
      isDemo: true,
      evidence: {
        personPresent: true,
        faceCount: 1,
        mouthVisible: true,
        audioDetected: true,
        avOffsetMs: 42,
        syncConfidence: 0.93,
        activeSpeakerScore: 0.91,
        audioSpoofScore: 0.08,
        visualSpoofScore: 0.05,
        challengeMatched: true,
        audioQuality: "good",
        videoQuality: "good",
        clockSynchronized: true,
        modelVersions: { avSync: "DemoSyncAdapter/0.1" },
      },
    },
    actuation: {
      allowed: true,
      output: "unlock_pulse",
      reason: "verified",
      validUntil: "2026-08-11T01:30:24.000Z",
    },
  });

  const batch = await moduleBuffer.pullEvents(0, 10);
  assert.equal(batch.events[0].verification.decision, "pass");
  assert.equal(batch.events[0].verification.evidence.avOffsetMs, 42);
  assert.equal(batch.events[0].actuation.output, "unlock_pulse");
});

test("유효하지 않은 수치형 지표는 모듈 버퍼에서 거부한다", () => {
  const moduleBuffer = new InMemoryModuleEventBuffer(device, 10);
  const invalid = draft(1);
  invalid.metrics[0].value = Number.NaN;

  assert.throws(() => moduleBuffer.append(invalid), TypeError);
});

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
