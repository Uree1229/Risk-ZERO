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
  if (event.decision === "block") {
    return {
      title: "발화 검증 차단",
      body: `${event.title} · 제어 요청을 확인해 주세요.`,
    };
  }
  if (event.decision === "inconclusive") {
    return {
      title: "발화 검증 필요",
      body: `${event.title} · ${event.detail}`,
    };
  }
  return {
    title: "발화 검증 알림",
    body: `${event.title} · ${event.detail}`,
  };
}
