import assert from "node:assert/strict";
import test from "node:test";
import { doorHubSnapshotToEventLogItems, recordsToDoorHubSnapshot, summarizeDoorHubRecord } from "./door-hub.ts";

const record = {
  schemaVersion: "door-hub-event/1",
  mode: "demo",
  scenarioId: "delivery",
  generatedAt: "2026-08-28T10:42:18.000Z",
  deviceId: "RZ-DOOR-HUB-DEMO-01",
  session: { eventId: 1042, stage: "result-ready", pirActive: false, startedAt: "2026-08-28T10:41:57.000Z", endedAt: "2026-08-28T10:42:17.000Z" },
  vision: { status: "ready", visitorPresent: false, objectCount: 0, primaryZone: 6, zoneMask: 32, dwellMs: 18200, backgroundChangeRatio: 0.12, backgroundChanged: true, snapshotReady: true, snapshotRef: null },
  safety: { heartbeatOk: true, authArmed: false, decision: "none", blockReason: null, faultLatched: false, doorClosed: true, tamperDetected: false, emergencyStop: false, outputTarget: "led", outputActive: false },
};

test("Door Hub 레코드를 최신 Snapshot으로 묶는다", () => {
  const snapshot = recordsToDoorHubSnapshot([record]);
  assert.equal(snapshot.session.eventId, 1042);
  assert.equal(snapshot.recentEvents[0].title, "방문 후 이탈");
  assert.match(snapshot.recentEvents[0].detail, /구역 6/);
});

test("Safety ABORT는 모바일 중요 이벤트로 변환한다", () => {
  const aborted = { ...record, safety: { ...record.safety, decision: "abort", faultLatched: true } };
  const snapshot = { ...aborted, recentEvents: [summarizeDoorHubRecord(aborted)] };
  const event = doorHubSnapshotToEventLogItems(snapshot)[0];
  assert.equal(event.level, "critical");
  assert.equal(event.decision, "block");
  assert.equal(event.score, null);
});
