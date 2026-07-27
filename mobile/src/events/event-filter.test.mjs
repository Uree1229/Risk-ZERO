import assert from "node:assert/strict";
import test from "node:test";
import { filterEvents } from "./event-filter.ts";

const events = [
  {
    id: "delivery",
    occurredAt: "13:00",
    title: "택배 방문",
    detail: "짧은 체류",
    level: "normal",
    score: 12,
    review: {
      category: "delivery",
      isFalseAlarm: false,
      isImportant: false,
      memo: "문 앞에 놓고 감",
    },
  },
  {
    id: "intrusion",
    occurredAt: "02:00",
    title: "반복 충격",
    detail: "강한 충격 7회",
    level: "critical",
    score: 91,
    review: {
      category: "intrusion",
      isFalseAlarm: false,
      isImportant: true,
      memo: "경찰 확인 필요",
    },
  },
];

test("제목·내용·메모를 검색한다", () => {
  assert.deepEqual(
    filterEvents(events, "경찰", "all").map((event) => event.id),
    ["intrusion"],
  );
});

test("분류와 중요 표시로 이벤트를 거른다", () => {
  assert.deepEqual(
    filterEvents(events, "", "delivery").map((event) => event.id),
    ["delivery"],
  );
  assert.deepEqual(
    filterEvents(events, "", "important").map((event) => event.id),
    ["intrusion"],
  );
});
