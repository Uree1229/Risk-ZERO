import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isNotificationEnabledForLevel,
  notificationCopy,
} from "./notification-policy.ts";

test("기본 설정은 차단에 연결된 알림 단계를 활성화한다", () => {
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

test("전체 알림이 꺼져 있으면 검증 판정과 관계없이 보내지 않는다", () => {
  assert.equal(
    isNotificationEnabledForLevel("critical", {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enabled: false,
    }),
    false,
  );
});

test("차단 알림은 제어 요청 확인 문구를 사용한다", () => {
  const copy = notificationCopy({
    id: "critical",
    occurredAt: "12:00",
    title: "음성 재생 차단",
    detail: "화면 속 발화자 없음",
    level: "critical",
    score: 88,
    decision: "block",
    confidence: 0.97,
  });
  assert.equal(copy.title, "발화 검증 차단");
  assert.match(copy.body, /제어 요청을 확인/);
});
