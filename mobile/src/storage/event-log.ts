import type { EventLogItem, SystemSnapshot } from "../types";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatEventTime(timestamp: string, now = new Date()) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const occurredToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return occurredToday
    ? time
    : `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${time}`;
}

export function snapshotToEventLogItem(
  snapshot: SystemSnapshot,
): EventLogItem {
  return {
    id: snapshot.sensorEvent.id,
    occurredAt: formatEventTime(snapshot.generatedAt),
    title: snapshot.scenarioLabel,
    detail: snapshot.assessment.summary,
    level: snapshot.assessment.level,
    score: snapshot.assessment.score,
  };
}
