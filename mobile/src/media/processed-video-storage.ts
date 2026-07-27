import type { ProcessedVideoFile } from "../module/contracts";
import type { StoredVideoResult } from "./processed-video-storage.native";

export async function storeProcessedVideo(
  _eventId: string,
  video: ProcessedVideoFile,
): Promise<StoredVideoResult> {
  return { video, newlyStored: false };
}

export function deleteStoredVideo(_localUri: string) {
  // 웹 시연은 실제 모바일 파일 저장소를 사용하지 않는다.
}
