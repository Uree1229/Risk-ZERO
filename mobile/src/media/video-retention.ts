export const DEFAULT_VIDEO_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;

export interface StoredVideoRecord {
  id: string;
  localUri: string;
  sizeBytes: number;
  capturedAt: string;
}

export function safeVideoFileName(eventId: string, fileName: string) {
  const safeEventId = eventId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const safeFileName = fileName
    .replace(/[\\/:"*?<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(-120);
  return `${safeEventId}-${safeFileName || "processed-video.mp4"}`;
}

export function selectVideosForRemoval(
  records: StoredVideoRecord[],
  limitBytes = DEFAULT_VIDEO_STORAGE_LIMIT_BYTES,
) {
  if (!Number.isFinite(limitBytes) || limitBytes < 0) {
    throw new RangeError("limitBytes must be a non-negative number.");
  }

  let totalBytes = records.reduce(
    (total, record) => total + Math.max(0, record.sizeBytes),
    0,
  );
  if (totalBytes <= limitBytes) return [];

  const removals: StoredVideoRecord[] = [];
  const oldestFirst = [...records].sort((left, right) =>
    left.capturedAt.localeCompare(right.capturedAt),
  );
  for (const record of oldestFirst) {
    removals.push(record);
    totalBytes -= Math.max(0, record.sizeBytes);
    if (totalBytes <= limitBytes) break;
  }
  return removals;
}
