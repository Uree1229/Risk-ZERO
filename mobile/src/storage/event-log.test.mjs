import assert from "node:assert/strict";
import test from "node:test";
import { formatEventTime } from "./event-log.ts";

test("오늘 발생한 이벤트는 시·분만 표시한다", () => {
  const now = new Date(2026, 6, 27, 18, 0);
  const occurredAt = new Date(2026, 6, 27, 9, 5).toISOString();
  assert.equal(formatEventTime(occurredAt, now), "09:05");
});

test("지난 날짜의 이벤트는 월·일도 함께 표시한다", () => {
  const now = new Date(2026, 6, 27, 18, 0);
  const occurredAt = new Date(2026, 6, 26, 23, 7).toISOString();
  assert.equal(formatEventTime(occurredAt, now), "07.26 23:07");
});
