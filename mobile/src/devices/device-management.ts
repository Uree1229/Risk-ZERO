import { deleteStoredVideo } from "../media/processed-video-storage";
import {
  deleteDeviceRecord,
  listDeviceStoredVideoRecords,
} from "../storage/local-database";

export async function removeDeviceAndStoredData(deviceId: string) {
  const videos = await listDeviceStoredVideoRecords(deviceId);
  for (const video of videos) deleteStoredVideo(video.localUri);
  await deleteDeviceRecord(deviceId);
  return { removedVideoCount: videos.length };
}
