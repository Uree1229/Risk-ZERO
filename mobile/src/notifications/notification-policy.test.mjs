import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isNotificationEnabledForLevel,
  notificationCopy,
} from "./notification-policy.ts";

test("기본 설정은 경고와 고위험 알림만 보낸다", () => {
  assert.equal(
    isNotificationEnabledForLevel("watch", DEFAULT_NOTIFICATION_PREFERENCES),
    false,
  );
  assert.equal(
    isNotificationEnabledForLevel("warning", DEFAULT_NOTIFICATION_PREFERENCES),
    true,
  );
  assert.equal(
    isNotificationEnabledForLevel("critical", DEFAULT_NOTIFICATION_PREFERENCES),
    true,
  );
});

test("전체 알림이 꺼져 있으면 위험 단계와 관계없이 보내지 않는다", () => {
  assert.equal(
    isNotificationEnabledForLevel("critical", {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enabled: false,
    }),
    false,
  );
});

test("고위험 알림은 즉시 확인 문구를 사용한다", () => {
  const copy = notificationCopy({
    id: "critical",
    occurredAt: "12:00",
    title: "강한 반복 충격",
    detail: "충격 7회",
    level: "critical",
    score: 88,
  });
  assert.equal(copy.title, "고위험 상황 감지");
  assert.match(copy.body, /즉시 현관 상황을 확인/);
});
