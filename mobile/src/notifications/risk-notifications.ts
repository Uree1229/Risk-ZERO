import type { EventLogItem, NotificationPreferences } from "../types";
import type {
  NotificationDispatchResult,
  NotificationPermissionState,
} from "./risk-notifications.native";
export type {
  NotificationDispatchResult,
  NotificationPermissionState,
} from "./risk-notifications.native";

let webPermission: NotificationPermissionState = "undetermined";

export async function initializeRiskNotifications() {
  return webPermission;
}

export async function requestRiskNotificationPermission() {
  webPermission = "granted";
  return webPermission;
}

export async function dispatchRiskNotification(
  _event: EventLogItem,
  preferences: NotificationPreferences,
): Promise<NotificationDispatchResult> {
  return preferences.enabled ? "permission-required" : "disabled";
}
