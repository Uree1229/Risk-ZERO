import type {
  EventLogItem,
  NotificationPreferences,
  RiskLevel,
} from "../types";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  watchEnabled: false,
  warningEnabled: true,
  criticalEnabled: true,
  cooldownMinutes: 10,
};

export function isNotificationEnabledForLevel(
  level: RiskLevel,
  preferences: NotificationPreferences,
) {
  if (!preferences.enabled) return false;
  if (level === "watch") return preferences.watchEnabled;
  if (level === "warning") return preferences.warningEnabled;
  if (level === "critical") return preferences.criticalEnabled;
  return false;
}

export function notificationCopy(event: EventLogItem) {
  if (event.level === "critical") {
    return {
      title: "고위험 상황 감지",
      body: `${event.title} · 즉시 현관 상황을 확인해 주세요.`,
    };
  }
  if (event.level === "warning") {
    return {
      title: "현관 위험 징후",
      body: `${event.title} · ${event.detail}`,
    };
  }
  return {
    title: "현관 주의 알림",
    body: `${event.title} · ${event.detail}`,
  };
}
