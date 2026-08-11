import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  acknowledgeRiskNotification,
  markRiskNotificationDelivered,
  releaseRiskNotification,
  reserveRiskNotification,
} from "../storage/local-database";
import type { EventLogItem, NotificationPreferences } from "../types";
import {
  isNotificationEnabledForLevel,
  notificationCopy,
} from "./notification-policy";

export type NotificationPermissionState =
  | "granted"
  | "denied"
  | "undetermined";

export type NotificationDispatchResult =
  | "delivered"
  | "disabled"
  | "permission-required"
  | "suppressed";

const categoryId = "risk-event";
let initialized = false;

function permissionState(
  status: Notifications.NotificationPermissionsStatus,
): NotificationPermissionState {
  if (status.granted) return "granted";
  if (status.canAskAgain) return "undetermined";
  return "denied";
}

export async function initializeRiskNotifications() {
  if (!initialized) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("risk-watch", {
        name: "주의 알림",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      await Notifications.setNotificationChannelAsync("risk-warning", {
        name: "경고 알림",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
      });
      await Notifications.setNotificationChannelAsync("risk-critical", {
        name: "발화 검증 차단",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 150, 400, 150, 400],
      });
    }

    await Notifications.setNotificationCategoryAsync(categoryId, [
      {
        identifier: "acknowledge",
        buttonTitle: "확인 완료",
        options: { opensAppToForeground: false },
      },
    ]);
    Notifications.addNotificationResponseReceivedListener((response) => {
      const eventId = response.notification.request.content.data?.eventId;
      if (typeof eventId === "string") {
        void acknowledgeRiskNotification(eventId);
      }
    });
    initialized = true;
  }

  return permissionState(await Notifications.getPermissionsAsync());
}

export async function requestRiskNotificationPermission() {
  await initializeRiskNotifications();
  return permissionState(await Notifications.requestPermissionsAsync());
}

function channelFor(event: EventLogItem) {
  if (event.level === "critical") return "risk-critical";
  if (event.level === "warning") return "risk-warning";
  return "risk-watch";
}

export async function dispatchRiskNotification(
  event: EventLogItem,
  preferences: NotificationPreferences,
): Promise<NotificationDispatchResult> {
  if (!isNotificationEnabledForLevel(event.level, preferences)) {
    return "disabled";
  }

  const permission = await initializeRiskNotifications();
  if (permission !== "granted") return "permission-required";

  const reserved = await reserveRiskNotification(
    event.id,
    event.level,
    preferences.cooldownMinutes,
  );
  if (!reserved) return "suppressed";

  try {
    const copy = notificationCopy(event);
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        data: { eventId: event.id },
        categoryIdentifier: categoryId,
        sound: event.level === "watch" ? undefined : "default",
      },
      trigger:
        Platform.OS === "android"
          ? { channelId: channelFor(event) }
          : null,
    });
    await markRiskNotificationDelivered(event.id, identifier);
    return "delivered";
  } catch (error) {
    await releaseRiskNotification(event.id);
    throw error;
  }
}
