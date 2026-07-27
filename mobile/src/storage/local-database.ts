import type { SystemSnapshot } from "../types";

// Expo 웹 미리보기에서는 네이티브 SQLite 대신 화면 동작만 유지합니다.
// Android와 iOS 빌드에서는 local-database.native.ts가 자동으로 선택됩니다.
export async function initializeLocalDatabase() {
  return Promise.resolve();
}

export async function saveSnapshotLocally(_snapshot: SystemSnapshot) {
  return Promise.resolve();
}
