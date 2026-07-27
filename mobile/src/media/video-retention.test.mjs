import assert from "node:assert/strict";
import test from "node:test";
import {
  safeVideoFileName,
  selectVideosForRemoval,
} from "./video-retention.ts";

test("영상 파일명에서 경로 문자와 특수문자를 제거한다", () => {
  assert.equal(
    safeVideoFileName("event:42", "../front door?.mp4"),
    "event_42-.._front_door_.mp4",
  );
});

test("저장 한도를 넘으면 오래된 영상부터 정리한다", () => {
  const records = [
    {
      id: "new",
      localUri: "file:///new.mp4",
      sizeBytes: 40,
      capturedAt: "2026-07-27T10:00:00.000Z",
    },
    {
      id: "old",
      localUri: "file:///old.mp4",
      sizeBytes: 40,
      capturedAt: "2026-07-25T10:00:00.000Z",
    },
    {
      id: "middle",
      localUri: "file:///middle.mp4",
      sizeBytes: 40,
      capturedAt: "2026-07-26T10:00:00.000Z",
    },
  ];

  assert.deepEqual(
    selectVideosForRemoval(records, 70).map((record) => record.id),
    ["old", "middle"],
  );
});

test("저장 한도 이내면 영상을 유지한다", () => {
  assert.deepEqual(
    selectVideosForRemoval(
      [
        {
          id: "video",
          localUri: "file:///video.mp4",
          sizeBytes: 20,
          capturedAt: "2026-07-27T10:00:00.000Z",
        },
      ],
      20,
    ),
    [],
  );
});
