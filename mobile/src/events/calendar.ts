import type { EventLogItem, RiskLevel } from "../types";

export type EventGroupMode = "time" | "risk";

export interface CalendarCell {
  date: Date;
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
}

export interface EventGroup {
  key: string;
  label: string;
  events: EventLogItem[];
}

const timeGroups = [
  { key: "dawn", label: "새벽", from: 0, to: 6 },
  { key: "morning", label: "오전", from: 6, to: 12 },
  { key: "afternoon", label: "오후", from: 12, to: 18 },
  { key: "evening", label: "저녁", from: 18, to: 24 },
] as const;

const riskGroups: Array<{ key: RiskLevel; label: string }> = [
  { key: "critical", label: "고위험" },
  { key: "warning", label: "경고" },
  { key: "watch", label: "주의" },
  { key: "normal", label: "정상" },
  { key: "pending", label: "판정 대기" },
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function eventDate(event: EventLogItem, fallback = new Date()) {
  if (event.capturedAt) {
    const captured = new Date(event.capturedAt);
    if (!Number.isNaN(captured.getTime())) return captured;
  }

  const datedTime = event.occurredAt.match(
    /^(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/,
  );
  if (datedTime) {
    return new Date(
      fallback.getFullYear(),
      Number(datedTime[1]) - 1,
      Number(datedTime[2]),
      Number(datedTime[3]),
      Number(datedTime[4]),
    );
  }

  const timeOnly = event.occurredAt.match(/^(\d{2}):(\d{2})$/);
  if (timeOnly) {
    return new Date(
      fallback.getFullYear(),
      fallback.getMonth(),
      fallback.getDate(),
      Number(timeOnly[1]),
      Number(timeOnly[2]),
    );
  }

  return fallback;
}

export function eventDateKey(event: EventLogItem, fallback = new Date()) {
  return toDateKey(eventDate(event, fallback));
}

export function monthTitle(month: Date) {
  return `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
}

export function shiftMonth(month: Date, offset: number) {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1);
}

export function buildMonthCells(month: Date): CalendarCell[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(
    month.getFullYear(),
    month.getMonth(),
    1 - firstDay.getDay(),
  );

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );
    return {
      date,
      dateKey: toDateKey(date),
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month.getMonth(),
    };
  });
}

export function eventsForDate(
  events: EventLogItem[],
  dateKey: string,
  fallback = new Date(),
) {
  return events
    .filter((event) => eventDateKey(event, fallback) === dateKey)
    .sort(
      (left, right) =>
        eventDate(right, fallback).getTime() -
        eventDate(left, fallback).getTime(),
    );
}

export function groupEvents(
  events: EventLogItem[],
  mode: EventGroupMode,
  fallback = new Date(),
): EventGroup[] {
  if (mode === "risk") {
    return riskGroups
      .map(({ key, label }) => ({
        key,
        label,
        events: events.filter((event) => event.level === key),
      }))
      .filter((group) => group.events.length > 0);
  }

  return timeGroups
    .map(({ key, label, from, to }) => ({
      key,
      label,
      events: events.filter((event) => {
        const hour = eventDate(event, fallback).getHours();
        return hour >= from && hour < to;
      }),
    }))
    .filter((group) => group.events.length > 0);
}
