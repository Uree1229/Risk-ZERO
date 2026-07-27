import { Directory, File, Paths } from "expo-file-system";
import type { ProcessedVideoFile } from "../module/contracts";
import { safeVideoFileName } from "./video-retention";

const processedVideoDirectory = new Directory(
  Paths.document,
  "risk-zero-processed-videos",
);

export interface StoredVideoResult {
  video: ProcessedVideoFile;
  newlyStored: boolean;
}

function ensureVideoDirectory() {
  processedVideoDirectory.create({ idempotent: true, intermediates: true });
}

export async function storeProcessedVideo(
  eventId: string,
  video: ProcessedVideoFile,
): Promise<StoredVideoResult> {
  ensureVideoDirectory();
  const destination = new File(
    processedVideoDirectory,
    safeVideoFileName(eventId, video.fileName),
  );

  if (destination.exists && destination.size === video.sizeBytes) {
    return {
      video: { ...video, localUri: destination.uri },
      newlyStored: false,
    };
  }

  const source = new File(video.localUri);
  if (!source.exists) {
    throw new Error(`Processed video source is not readable: ${video.fileName}`);
  }

  await source.copy(destination, { overwrite: true });
  if (!destination.exists || destination.size !== video.sizeBytes) {
    if (destination.exists) destination.delete();
    throw new Error(`Processed video size mismatch: ${video.fileName}`);
  }

  return {
    video: {
      ...video,
      localUri: destination.uri,
      sizeBytes: destination.size,
    },
    newlyStored: true,
  };
}

export function deleteStoredVideo(localUri: string) {
  ensureVideoDirectory();
  if (!localUri.startsWith(processedVideoDirectory.uri)) {
    throw new Error("Refusing to delete a video outside the app video store.");
  }
  const file = new File(localUri);
  if (file.exists) file.delete();
}
