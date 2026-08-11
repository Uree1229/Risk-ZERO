import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPTURE_MANIFEST_VERSION,
  captureFileStem,
  createCaptureManifest,
  mediaFileExtension,
} from "../lib/capture-manifest.ts";

test("creates a local, unevaluated capture manifest", () => {
  const manifest = createCaptureManifest({
    sessionId: "64cae736-e532-4692-97d6-21fd87fb39f1",
    participantCode: " P01 ",
    scenario: "audio-replay",
    challengePhrase: "초록 우산 문 열어",
    startedAt: new Date("2026-08-11T03:00:00.000Z"),
    endedAt: new Date("2026-08-11T03:00:04.250Z"),
    fileName: "capture.webm",
    mimeType: "video/webm;codecs=vp8,opus",
    sizeBytes: 4096,
  });

  assert.equal(manifest.schemaVersion, CAPTURE_MANIFEST_VERSION);
  assert.equal(manifest.participantCode, "P01");
  assert.equal(manifest.scenario, "audio-replay");
  assert.equal(manifest.capturedAt.durationMs, 4250);
  assert.equal(manifest.source, "browser-local");
  assert.equal(manifest.verificationStatus, "not_evaluated");
});

test("builds matching, filesystem-safe capture names", () => {
  const stem = captureFileStem("64cae736-e532-4692-97d6", "bona-fide", new Date("2026-08-11T03:04:05.123Z"));
  assert.equal(stem, "risk-zero_20260811T030405Z_bona-fide_64cae736-e53");
  assert.equal(mediaFileExtension("video/mp4"), "mp4");
  assert.equal(mediaFileExtension("video/webm;codecs=vp8,opus"), "webm");
});

test("rejects incomplete or invalid capture metadata", () => {
  const base = {
    sessionId: "session-1",
    participantCode: "P01",
    scenario: "bona-fide",
    challengePhrase: "초록 우산 문 열어",
    startedAt: new Date("2026-08-11T03:00:04.000Z"),
    endedAt: new Date("2026-08-11T03:00:03.000Z"),
    fileName: "capture.webm",
    mimeType: "video/webm",
    sizeBytes: 10,
  };

  assert.throws(() => createCaptureManifest(base), /endedAt/);
  assert.throws(() => createCaptureManifest({ ...base, endedAt: base.startedAt, participantCode: " " }), /participantCode/);
  assert.throws(() => createCaptureManifest({ ...base, endedAt: base.startedAt, sizeBytes: -1 }), /sizeBytes/);
});
