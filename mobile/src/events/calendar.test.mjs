import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonthCells,
  eventDateKey,
  eventsForDate,
  groupEvents,
  monthTitle,
  shiftMonth,
} from "./calendar.ts";

function localTimestamp(year, monthIndex, day, hour, minute) {
  return new Date(year, monthIndex, day, hour, minute).toISOString();
}

const events = [
  {
    id: "critical-evening",
    capturedAt: localTimestamp(2026, 6, 27, 20, 15),
    occurredAt: "20:15",
    title: "고위험",
    detail: "반복 충격",
    level: "critical",
    score: 88,
    decision: "block",
    confidence: 0.97,
  },
  {
    id: "watch-morning",
    capturedAt: localTimestamp(2026, 6, 27, 9, 10),
    occurredAt: "09:10",
    title: "주의",
    detail: "장시간 체류",
    level: "watch",
    score: 46,
    decision: "inconclusive",
    confidence: 0.38,
  },
  {
    id: "normal-yesterday",
    capturedAt: localTimestamp(2026, 6, 26, 18, 0),
    occurredAt: "07.26 18:00",
    title: "정상",
    detail: "짧은 방문",
    level: "normal",
    score: 14,
    decision: "pass",
    confidence: 0.91,
  },
];

test("달력은 앞뒤 날짜를 포함한 6주 단위로 만든다", () => {
  const month = new Date(2026, 6, 1);
  const cells = buildMonthCells(month);
  assert.equal(cells.length, 42);
  assert.equal(cells[0].dateKey, "2026-06-28");
  assert.equal(cells[41].dateKey, "2026-08-08");
});

test("월 이동과 제목을 계산한다", () => {
  const july = new Date(2026, 6, 1);
  assert.equal(monthTitle(july), "2026년 7월");
  assert.equal(monthTitle(shiftMonth(july, 1)), "2026년 8월");
});

test("선택 날짜의 이벤트를 최신순으로 조회한다", () => {
  const selected = eventsForDate(events, "2026-07-27");
  assert.deepEqual(
    selected.map((event) => event.id),
    ["critical-evening", "watch-morning"],
  );
});

test("이벤트를 시간대와 검증 판정으로 분류한다", () => {
  const selected = eventsForDate(events, "2026-07-27");
  assert.deepEqual(
    groupEvents(selected, "time").map((group) => group.label),
    ["오전", "저녁"],
  );
  assert.deepEqual(
    groupEvents(selected, "decision").map((group) => group.label),
    ["차단", "판단 불가"],
  );
});

test("날짜가 없는 기존 이벤트는 기준 날짜를 사용한다", () => {
  const fallback = new Date(2026, 6, 27, 12, 0);
  assert.equal(
    eventDateKey(
      {
        id: "legacy",
        occurredAt: "09:20",
        title: "기존 이벤트",
        detail: "",
        level: "pending",
        score: null,
        decision: "pending",
        confidence: null,
      },
      fallback,
    ),
    "2026-07-27",
  );
});
