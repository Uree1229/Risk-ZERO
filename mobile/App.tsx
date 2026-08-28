import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { getDoorHubSnapshot } from "./src/api";
import {
  loadRecentEvents,
  loadNotificationPreferences,
  loadDevices,
  loadVideoStorageSummary,
  registerDeviceLocally,
  saveEventReview,
  saveDoorHubSnapshotLocally,
  saveNotificationPreferences,
} from "./src/storage/local-database";
import { EventsScreen } from "./src/events/EventsScreen";
import {
  dispatchRiskNotification,
  initializeRiskNotifications,
  requestRiskNotificationPermission,
  type NotificationPermissionState,
} from "./src/notifications/risk-notifications";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./src/notifications/notification-policy";
import { doorHubSnapshotToEventLogItems } from "./src/door-hub";
import { removeDeviceAndStoredData } from "./src/devices/device-management";
import type {
  DeviceRegistrationInput,
  DeviceSummary,
  DoorHubSnapshot,
  DoorHubStage,
  EventLogItem,
  NotificationPreferences,
  SafetyDecision,
  VideoStorageSummary,
} from "./src/types";

type TabId = "home" | "events" | "settings";

const scenarios = [
  { id: "delivery", label: "택배 후 이탈" },
  { id: "lingering", label: "장시간 체류" },
  { id: "return", label: "재접근" },
  { id: "safety-abort", label: "안전 차단" },
];

const stageLabel: Record<DoorHubStage, string> = {
  idle: "대기",
  "vision-wake": "Vision 기동",
  "camera-init": "카메라 준비",
  capture: "관찰 중",
  "end-background": "종료 배경 저장",
  "result-ready": "결과 준비됨",
  "vision-sleep": "Vision 절전",
  fault: "오류 고정",
};

const safetyLabel: Record<SafetyDecision, string> = {
  none: "요청 없음",
  allow: "허용",
  block: "차단",
  abort: "강제 차단",
};

function HomeScreen({
  snapshot,
  source,
  refreshing,
  onRefresh,
  onScenario,
}: {
  snapshot: DoorHubSnapshot;
  source: "api" | "fallback";
  refreshing: boolean;
  onRefresh: () => void;
  onScenario: (scenarioId: string) => void;
}) {
  const safetyFault = snapshot.safety.decision === "abort" || snapshot.safety.faultLatched;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9FE3CC" />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroCopy}>
        <Text style={styles.eyebrow}>DOOR HUB EVENT</Text>
        <Text style={styles.title}>현관 이벤트</Text>
        <Text style={styles.heroDescription}>FPGA 영상 결과와 독립 Safety 상태를 확인합니다.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scenarioRow}>
        {scenarios.map((scenario) => {
          const active = snapshot.scenarioId === scenario.id;
          return (
            <Pressable key={scenario.id} style={[styles.scenarioButton, active && styles.scenarioButtonActive]} onPress={() => onScenario(scenario.id)}>
              <Text style={[styles.scenarioText, active && styles.scenarioTextActive]}>{scenario.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.riskCard, safetyFault && styles.safetyFaultCard]}>
        <View style={styles.riskTopline}>
          <View>
            <Text style={styles.sectionLabel}>EVENT #{snapshot.session.eventId}</Text>
            <Text style={[styles.riskLabel, safetyFault && styles.safetyFaultText]}>{stageLabel[snapshot.session.stage]}</Text>
          </View>
          <View style={[styles.sourceBadge, { backgroundColor: source === "api" ? "#143027" : "#2A2518" }]}>
            <View style={[styles.sourceDot, { backgroundColor: source === "api" ? "#72D8B2" : "#F5C86C" }]} />
            <Text style={styles.sourceText}>{source === "api" ? "ONLINE" : "OFFLINE"}</Text>
          </View>
        </View>

        <View style={styles.presenceRow}>
          <View style={styles.presenceCopy}>
            <Text style={styles.presenceCaption}>방문자</Text>
            <Text style={styles.presenceValue}>{snapshot.vision.visitorPresent ? "관찰 중" : "이탈 확인"}</Text>
            <Text style={styles.presenceZone}>{snapshot.vision.primaryZone ? `마지막 구역 ${snapshot.vision.primaryZone}` : "구역 정보 없음"}</Text>
          </View>
          <View style={styles.pirBadge}>
            <View style={[styles.sourceDot, { backgroundColor: snapshot.session.pirActive ? "#F5C86C" : "#72D8B2" }]} />
            <Text style={styles.sourceText}>{snapshot.session.pirActive ? "PIR ACTIVE" : "PIR END"}</Text>
          </View>
        </View>

        <View style={styles.hubMetricGrid}>
          {[
            ["객체", `${snapshot.vision.objectCount}개`],
            ["체류", `${Math.round(snapshot.vision.dwellMs / 1000)}초`],
            ["배경 변화", `${Math.round(snapshot.vision.backgroundChangeRatio * 100)}%`],
            ["Snapshot", snapshot.vision.snapshotReady ? "준비됨" : "대기"],
          ].map(([label, value]) => <View style={styles.hubMetric} key={label}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.hubMetricValue}>{value}</Text></View>)}
        </View>
      </View>

      <View style={styles.sectionTitleRow}>
        <View><Text style={styles.sectionLabel}>SAFETY GATE</Text><Text style={styles.sectionTitle}>{safetyLabel[snapshot.safety.decision]}</Text></View>
        <Text style={styles.providerText}>{snapshot.safety.outputActive ? "LED ON" : "LED OFF"}</Text>
      </View>
      <View style={styles.safetyGrid}>
        {[
          ["Heartbeat", snapshot.safety.heartbeatOk],
          ["문 닫힘", snapshot.safety.doorClosed],
          ["Tamper 정상", !snapshot.safety.tamperDetected],
          ["E-stop 정상", !snapshot.safety.emergencyStop],
        ].map(([label, ok]) => <View style={[styles.safetyFlag, !ok && styles.safetyFlagFault]} key={String(label)}><View style={[styles.flagDot, { backgroundColor: ok ? "#56D3AD" : "#FF6C73" }]} /><Text style={styles.safetyFlagText}>{label}</Text></View>)}
      </View>
      {snapshot.safety.blockReason ? <Pressable style={styles.blockReason} onPress={() => Alert.alert("Safety 차단", snapshot.safety.blockReason ?? "-")}><Text style={styles.blockReasonLabel}>차단 근거</Text><Text style={styles.blockReasonText}>{snapshot.safety.blockReason}</Text></Pressable> : null}
    </ScrollView>
  );
}

function formatStorage(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes > 0 ? 1 : 0)} MB`;
}

function relativeSyncTime(timestamp: string) {
  const differenceMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000),
  );
  if (differenceMinutes < 1) return "방금 전";
  if (differenceMinutes < 60) return `${differenceMinutes}분 전`;
  const hours = Math.floor(differenceMinutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function SettingsScreen({
  source,
  notificationPreferences,
  notificationPermission,
  videoStorage,
  devices,
  onNotificationPreferences,
  onRequestNotificationPermission,
  onRegisterDevice,
  onRemoveDevice,
}: {
  source: "api" | "fallback";
  notificationPreferences: NotificationPreferences;
  notificationPermission: NotificationPermissionState;
  videoStorage: VideoStorageSummary;
  devices: DeviceSummary[];
  onNotificationPreferences: (preferences: NotificationPreferences) => void;
  onRequestNotificationPermission: () => void;
  onRegisterDevice: (input: DeviceRegistrationInput) => Promise<void>;
  onRemoveDevice: (deviceId: string) => Promise<void>;
}) {
  const [registrationVisible, setRegistrationVisible] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [deviceTransport, setDeviceTransport] =
    useState<DeviceRegistrationInput["transport"]>("ble");
  const [deviceSaving, setDeviceSaving] = useState(false);
  const permissionLabel = {
    granted: "허용됨",
    denied: "차단됨",
    undetermined: "확인 필요",
  }[notificationPermission];
  const notificationRows = [
    {
      key: "watchEnabled" as const,
      label: "관찰 지속 알림",
      description: "장시간 체류·재접근 확인",
    },
    {
      key: "warningEnabled" as const,
      label: "Safety 차단 알림",
      description: "BLOCK 판정 확인",
    },
    {
      key: "criticalEnabled" as const,
      label: "강제 차단 알림",
      description: "ABORT·Tamper·E-stop 확인",
    },
  ];
  const storageRatio =
    videoStorage.limitBytes > 0
      ? Math.min(1, videoStorage.totalBytes / videoStorage.limitBytes)
      : 0;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>SETTINGS</Text>
      <Text style={styles.pageTitle}>알림 및 저장</Text>

      <View style={styles.settingsSectionHeader}>
        <Text style={styles.settingsSectionTitle}>Door Hub 알림</Text>
        <Text style={styles.settingsSectionCaption}>반복 제한 {notificationPreferences.cooldownMinutes}분</Text>
      </View>
      <View style={styles.settingsCard}>
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabelStrong}>전체 알림</Text>
            <Text style={styles.settingDescription}>관찰·Safety 결과 알림</Text>
          </View>
          <Switch
            value={notificationPreferences.enabled}
            onValueChange={(enabled) =>
              onNotificationPreferences({
                ...notificationPreferences,
                enabled,
              })
            }
            trackColor={{ false: "#263234", true: "#4F8F7B" }}
            thumbColor={notificationPreferences.enabled ? "#9FE3CC" : "#718082"}
          />
        </View>
        {notificationRows.map((row) => (
          <View style={styles.settingRow} key={row.key}>
            <View>
              <Text style={styles.settingLabelStrong}>{row.label}</Text>
              <Text style={styles.settingDescription}>{row.description}</Text>
            </View>
            <Switch
              disabled={!notificationPreferences.enabled}
              value={notificationPreferences[row.key]}
              onValueChange={(enabled) =>
                onNotificationPreferences({
                  ...notificationPreferences,
                  [row.key]: enabled,
                })
              }
              trackColor={{ false: "#263234", true: "#4F8F7B" }}
              thumbColor={
                notificationPreferences[row.key] ? "#9FE3CC" : "#718082"
              }
            />
          </View>
        ))}
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabelStrong}>알림 권한</Text>
            <Text style={styles.settingDescription}>{permissionLabel}</Text>
          </View>
          <Pressable
            style={styles.permissionButton}
            onPress={onRequestNotificationPermission}
          >
            <Text style={styles.permissionButtonText}>
              {notificationPermission === "granted" ? "다시 확인" : "권한 설정"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.settingsSectionHeader}>
        <Text style={styles.settingsSectionTitle}>영상 저장</Text>
        <Text style={styles.settingsSectionCaption}>앱 전용 저장소</Text>
      </View>
      <View style={styles.storageCard}>
        <View style={styles.storageTopline}>
          <View>
            <Text style={styles.storageValue}>
              {formatStorage(videoStorage.totalBytes)}
            </Text>
            <Text style={styles.storageCaption}>
              후처리 영상 {videoStorage.fileCount}개
            </Text>
          </View>
          <Text style={styles.storageLimit}>
            최대 {formatStorage(videoStorage.limitBytes)}
          </Text>
        </View>
        <View style={styles.storageTrack}>
          <View
            style={[styles.storageFill, { width: `${storageRatio * 100}%` }]}
          />
        </View>
        <Text style={styles.storagePolicy}>
          저장 한도를 넘으면 가장 오래된 영상부터 자동으로 정리합니다.
        </Text>
      </View>

      <View style={styles.settingsSectionHeader}>
        <Text style={styles.settingsSectionTitle}>장치 관리</Text>
        <Pressable
          style={styles.addDeviceButton}
          onPress={() => setRegistrationVisible((visible) => !visible)}
        >
          <Text style={styles.addDeviceButtonText}>
            {registrationVisible ? "닫기" : "+ 새 장치"}
          </Text>
        </Pressable>
      </View>

      {registrationVisible ? (
        <View style={styles.registrationCard}>
          <Text style={styles.registrationTitle}>장치 프로필 등록</Text>
          <Text style={styles.registrationCopy}>
            실제 통신 연결 전 사용할 장치 정보입니다.
          </Text>
          <TextInput
            autoCapitalize="characters"
            placeholder="장치 ID (예: RZ-DOOR-02)"
            placeholderTextColor="#536164"
            style={styles.deviceInput}
            value={deviceId}
            onChangeText={setDeviceId}
          />
          <TextInput
            placeholder="장치 이름 (예: 현관 엣지 장치)"
            placeholderTextColor="#536164"
            style={styles.deviceInput}
            value={deviceName}
            onChangeText={setDeviceName}
          />
          <View style={styles.transportRow}>
            {(
              [
                ["ble", "BLE"],
                ["wifi", "Wi-Fi"],
                ["serial", "유선"],
                ["other", "기타"],
              ] as const
            ).map(([transport, label]) => (
              <Pressable
                key={transport}
                style={[
                  styles.transportButton,
                  deviceTransport === transport &&
                    styles.transportButtonActive,
                ]}
                onPress={() => setDeviceTransport(transport)}
              >
                <Text
                  style={[
                    styles.transportButtonText,
                    deviceTransport === transport &&
                      styles.transportButtonTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            disabled={deviceSaving}
            style={[
              styles.registerButton,
              deviceSaving && styles.disabledAction,
            ]}
            onPress={() => {
              void (async () => {
                setDeviceSaving(true);
                try {
                  await onRegisterDevice({
                    id: deviceId,
                    displayName: deviceName,
                    transport: deviceTransport,
                  });
                  setDeviceId("");
                  setDeviceName("");
                  setRegistrationVisible(false);
                } catch (error) {
                  Alert.alert(
                    "장치 등록 실패",
                    error instanceof Error ? error.message : String(error),
                  );
                } finally {
                  setDeviceSaving(false);
                }
              })();
            }}
          >
            <Text style={styles.registerButtonText}>
              {deviceSaving ? "등록 중" : "장치 등록"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.deviceList}>
        {devices.map((device) => {
          const storageRatio =
            device.storageUsedBytes !== null &&
            device.storageCapacityBytes !== null &&
            device.storageCapacityBytes > 0
              ? Math.min(
                  1,
                  device.storageUsedBytes / device.storageCapacityBytes,
                )
              : 0;
          const syncLabel = {
            idle: "대기",
            syncing: "동기화 중",
            error: "연결 오류",
          }[device.syncStatus];
          return (
            <View style={styles.deviceCard} key={device.id}>
              <View style={styles.deviceHeader}>
                <View style={styles.deviceIdentity}>
                  <View style={styles.deviceIcon}>
                    <Text style={styles.deviceIconText}>RZ</Text>
                  </View>
                  <View>
                    <Text style={styles.deviceName}>{device.displayName}</Text>
                    <Text style={styles.deviceId}>{device.id}</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.deviceStatus,
                    device.syncStatus === "error" &&
                      styles.deviceStatusError,
                  ]}
                >
                  <View style={styles.deviceStatusDot} />
                  <Text style={styles.deviceStatusText}>{syncLabel}</Text>
                </View>
              </View>

              <View style={styles.deviceStats}>
                <View style={styles.deviceStat}>
                  <Text style={styles.deviceStatLabel}>배터리</Text>
                  <Text style={styles.deviceStatValue}>
                    {device.batteryPercent === null
                      ? "-"
                      : `${Math.round(device.batteryPercent)}%`}
                  </Text>
                </View>
                <View style={styles.deviceStat}>
                  <Text style={styles.deviceStatLabel}>통신</Text>
                  <Text style={styles.deviceStatValue}>
                    {device.transport.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.deviceStat}>
                  <Text style={styles.deviceStatLabel}>최근 동기화</Text>
                  <Text style={styles.deviceStatValue}>
                    {relativeSyncTime(device.lastSyncedAt)}
                  </Text>
                </View>
              </View>

              <View style={styles.deviceStorageRow}>
                <Text style={styles.deviceStorageLabel}>모듈 저장 공간</Text>
                <Text style={styles.deviceStorageValue}>
                  {device.storageUsedBytes === null ||
                  device.storageCapacityBytes === null
                    ? "데이터 없음"
                    : `${formatStorage(device.storageUsedBytes)} / ${formatStorage(device.storageCapacityBytes)}`}
                </Text>
              </View>
              <View style={styles.deviceStorageTrack}>
                <View
                  style={[
                    styles.deviceStorageFill,
                    { width: `${storageRatio * 100}%` },
                  ]}
                />
              </View>

              <Pressable
                style={styles.removeDeviceButton}
                onPress={() =>
                  Alert.alert(
                    "장치 연결 해제",
                    `${device.displayName}의 로컬 이벤트와 영상을 함께 삭제합니다.`,
                    [
                      { text: "취소", style: "cancel" },
                      {
                        text: "연결 해제",
                        style: "destructive",
                        onPress: () => void onRemoveDevice(device.id),
                      },
                    ],
                  )
                }
              >
                <Text style={styles.removeDeviceButtonText}>연결 해제</Text>
              </Pressable>
            </View>
          );
        })}
        {devices.length === 0 ? (
          <View style={styles.noDeviceCard}>
            <Text style={styles.noDeviceTitle}>등록된 장치가 없습니다</Text>
            <Text style={styles.noDeviceCopy}>
              새 장치를 눌러 장치 프로필을 등록해 주세요.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>현재 연결</Text>
        <Text style={styles.noticeCopy}>
          {source === "api" ? "개발 API에 연결됨" : "오프라인 시연 데이터 사용 중"} ·
          실제 모델과 도어락은 연결하지 않았습니다.
        </Text>
      </View>
    </ScrollView>
  );
}

function RiskZeroApp() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [scenarioId, setScenarioId] = useState("delivery");
  const [snapshot, setSnapshot] = useState<DoorHubSnapshot | null>(null);
  const [events, setEvents] = useState<EventLogItem[]>([]);
  const [source, setSource] = useState<"api" | "fallback">("fallback");
  const [refreshing, setRefreshing] = useState(false);
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>("undetermined");
  const [videoStorage, setVideoStorage] = useState<VideoStorageSummary>({
    fileCount: 0,
    totalBytes: 0,
    limitBytes: 500 * 1024 * 1024,
  });
  const [devices, setDevices] = useState<DeviceSummary[]>([]);

  const load = useCallback(async (nextScenario = scenarioId) => {
    setRefreshing(true);
    const result = await getDoorHubSnapshot(nextScenario);
    setSnapshot(result.snapshot);
    setSource(result.source);
    try {
      await saveDoorHubSnapshotLocally(result.snapshot);
      const localEvents = await loadRecentEvents();
      const currentDoorHubEvents = doorHubSnapshotToEventLogItems(result.snapshot);
      const mergedEvents = new Map(
        currentDoorHubEvents.map((event) => [event.id, event]),
      );
      for (const event of localEvents) mergedEvents.set(event.id, event);
      setEvents(
        [...mergedEvents.values()].sort((left, right) => {
          const leftTime = left.capturedAt
            ? new Date(left.capturedAt).getTime()
            : 0;
          const rightTime = right.capturedAt
            ? new Date(right.capturedAt).getTime()
            : 0;
          return rightTime - leftTime;
        }),
      );
      setVideoStorage(await loadVideoStorageSummary());
      setDevices(await loadDevices());
      const latestEvent = currentDoorHubEvents[0];
      if (latestEvent) void dispatchRiskNotification(latestEvent, notificationPreferences);
    } catch (error) {
      console.warn("Failed to save the mobile snapshot.", error);
      setEvents(doorHubSnapshotToEventLogItems(result.snapshot));
    }
    setRefreshing(false);
  }, [notificationPreferences, scenarioId]);

  useEffect(() => {
    void (async () => {
      setNotificationPreferences(await loadNotificationPreferences());
      setNotificationPermission(await initializeRiskNotifications());
      await load("delivery");
    })();
  }, []);

  const selectScenario = useCallback((nextScenario: string) => {
    setScenarioId(nextScenario);
    void load(nextScenario);
  }, [load]);

  const content = useMemo(() => {
    if (!snapshot) return <View style={styles.loading}><ActivityIndicator color="#9FE3CC" size="large" /><Text style={styles.loadingText}>Door Hub 상태를 불러오는 중</Text></View>;
    if (activeTab === "events") {
      return (
        <EventsScreen
          events={events}
          onSaveReview={async (eventId, review) => {
            const savedReview = await saveEventReview(eventId, review);
            setEvents((current) =>
              current.map((event) =>
                event.id === eventId
                  ? { ...event, review: savedReview }
                  : event,
              ),
            );
            return savedReview;
          }}
        />
      );
    }
    if (activeTab === "settings") {
      return (
        <SettingsScreen
          notificationPermission={notificationPermission}
          notificationPreferences={notificationPreferences}
          source={source}
          videoStorage={videoStorage}
          devices={devices}
          onNotificationPreferences={(preferences) => {
            setNotificationPreferences(preferences);
            void saveNotificationPreferences(preferences);
          }}
          onRequestNotificationPermission={() => {
            void requestRiskNotificationPermission().then(setNotificationPermission);
          }}
          onRegisterDevice={async (input) => {
            await registerDeviceLocally(input);
            setDevices(await loadDevices());
          }}
          onRemoveDevice={async (deviceId) => {
            await removeDeviceAndStoredData(deviceId);
            setDevices(await loadDevices());
            setVideoStorage(await loadVideoStorageSummary());
          }}
        />
      );
    }
    return <HomeScreen snapshot={snapshot} source={source} refreshing={refreshing} onRefresh={() => void load()} onScenario={selectScenario} />;
  }, [activeTab, devices, events, load, notificationPermission, notificationPreferences, refreshing, selectScenario, snapshot, source, videoStorage]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.brandRow}><View style={styles.brandMark}><Text style={styles.brandMarkText}>RZ</Text></View><View><Text style={styles.brandName}>RISK-ZERO</Text><Text style={styles.brandSub}>Door Hub Monitor</Text></View></View>
        <View style={styles.demoBadge}><View style={styles.onlineDot} /><Text style={styles.demoBadgeText}>{source === "api" ? "API" : "DEMO"}</Text></View>
      </View>
      <View style={styles.content}>{content}</View>
      <View style={styles.tabBar}>
        {([{ id: "home", label: "홈", symbol: "⌂" }, { id: "events", label: "이벤트", symbol: "≡" }, { id: "settings", label: "설정", symbol: "⚙" }] as const).map((tab) => {
          const active = activeTab === tab.id;
          return <Pressable key={tab.id} style={styles.tabButton} onPress={() => setActiveTab(tab.id)}><Text style={[styles.tabSymbol, active && styles.tabActive]}>{tab.symbol}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{tab.label}</Text></Pressable>;
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <RiskZeroApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#091011" },
  header: { height: 68, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "#1D292A", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#9FE3CC", alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "#07110E", fontWeight: "900", letterSpacing: -1 },
  brandName: { color: "#F4F7F7", fontSize: 13, fontWeight: "800", letterSpacing: 1.4 },
  brandSub: { color: "#718082", fontSize: 10, marginTop: 2 },
  demoBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#142521" },
  demoBadgeText: { color: "#9FE3CC", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  onlineDot: { width: 6, height: 6, borderRadius: 99, backgroundColor: "#56D3AD" },
  content: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 34 },
  heroCopy: { paddingTop: 15 },
  eyebrow: { color: "#9FE3CC", fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#F4F7F7", fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1.5, marginTop: 8 },
  heroDescription: { color: "#7E8D8F", fontSize: 11, lineHeight: 17, marginTop: 8 },
  pageTitle: { color: "#F4F7F7", fontSize: 30, lineHeight: 38, fontWeight: "800", letterSpacing: -1.2, marginTop: 10 },
  scenarioRow: { gap: 8, paddingVertical: 18 },
  scenarioButton: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: "#243234", backgroundColor: "#0F1718", outlineWidth: 0 },
  scenarioButtonActive: { backgroundColor: "#9FE3CC", borderColor: "#9FE3CC" },
  scenarioText: { color: "#9DAAAB", fontSize: 11, fontWeight: "700" },
  scenarioTextActive: { color: "#07110E" },
  riskCard: { borderWidth: 1, borderRadius: 20, padding: 18, backgroundColor: "#11191A" },
  safetyFaultCard: { borderColor: "#6A3338" },
  riskTopline: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  sectionLabel: { color: "#778587", fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  riskLabel: { fontSize: 23, fontWeight: "800", marginTop: 5 },
  safetyFaultText: { color: "#FF6C73" },
  sourceBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  sourceDot: { width: 5, height: 5, borderRadius: 99 },
  sourceText: { color: "#D5E0DF", fontSize: 8, fontWeight: "800", letterSpacing: .6 },
  presenceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 24 },
  presenceCopy: { flex: 1 },
  presenceCaption: { color: "#718082", fontSize: 9 },
  presenceValue: { color: "#F4F7F7", fontSize: 30, fontWeight: "900", letterSpacing: -1.2, marginTop: 6 },
  presenceZone: { color: "#9FE3CC", fontSize: 10, marginTop: 6 },
  pirBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 99, backgroundColor: "#182224" },
  hubMetricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hubMetric: { width: "48.5%", minHeight: 74, borderRadius: 12, borderWidth: 1, borderColor: "#263234", padding: 13, justifyContent: "center" },
  hubMetricValue: { color: "#EEF3F2", fontSize: 17, fontWeight: "900", marginTop: 6 },
  safetyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  safetyFlag: { width: "48.5%", minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 11, borderWidth: 1, borderColor: "#263234", backgroundColor: "#11191A", paddingHorizontal: 13 },
  safetyFlagFault: { borderColor: "#6A3338", backgroundColor: "#211417" },
  flagDot: { width: 7, height: 7, borderRadius: 7 },
  safetyFlagText: { color: "#B9C5C4", fontSize: 10, fontWeight: "700" },
  blockReason: { marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: "#6A3338", backgroundColor: "#211417", padding: 14 },
  blockReasonLabel: { color: "#FF8B91", fontSize: 9, fontWeight: "900" },
  blockReasonText: { color: "#D7B8BA", fontSize: 10, marginTop: 5 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 18, paddingVertical: 24 },
  scoreCircle: { width: 126, height: 126, borderRadius: 70, borderWidth: 9, alignItems: "center", justifyContent: "center" },
  scoreNumber: { fontSize: 42, fontWeight: "900", letterSpacing: -2 },
  scoreUnit: { color: "#718082", fontSize: 9 },
  scoreCopy: { flex: 1 },
  summary: { color: "#CFD7D7", fontSize: 12, lineHeight: 18 },
  reasonWrap: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10 },
  reasonPill: { color: "#9DAAAB", fontSize: 8, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, borderWidth: 1, borderColor: "#263335" },
  responseBox: { borderTopWidth: 1, borderTopColor: "#263234", paddingTop: 15 },
  responseLabel: { color: "#9FE3CC", fontSize: 9, fontWeight: "800" },
  responseMessage: { color: "#899799", fontSize: 10, lineHeight: 16, marginTop: 5 },
  confirmButton: { marginTop: 12, paddingVertical: 11, borderRadius: 10, backgroundColor: "#FF6C73", alignItems: "center" },
  confirmButtonText: { color: "#2B0A0C", fontSize: 11, fontWeight: "900" },
  sectionTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 28, marginBottom: 12 },
  sectionTitle: { color: "#F4F7F7", fontSize: 20, fontWeight: "800", marginTop: 5 },
  providerText: { color: "#667577", fontSize: 8 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { width: "48.5%", minHeight: 116, borderRadius: 14, borderWidth: 1, borderColor: "#223032", backgroundColor: "#11191A", padding: 15, justifyContent: "center" },
  metricHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metricLabel: { color: "#899799", fontSize: 9 },
  metricValue: { color: "#F4F7F7", fontSize: 20, fontWeight: "800", letterSpacing: -.6, marginTop: 8 },
  settingsCard: { borderRadius: 14, borderWidth: 1, borderColor: "#223032", backgroundColor: "#11191A", overflow: "hidden" },
  settingsSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 24, marginBottom: 10 },
  settingsSectionTitle: { color: "#E7ECEB", fontSize: 14, fontWeight: "900" },
  settingsSectionCaption: { color: "#667577", fontSize: 9 },
  settingRow: { minHeight: 52, paddingHorizontal: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#283436" },
  settingLabel: { color: "#899799", fontSize: 10 },
  settingValue: { color: "#E5ECEB", fontSize: 10, fontWeight: "700" },
  settingLabelStrong: { color: "#D8E0DF", fontSize: 11, fontWeight: "800" },
  settingDescription: { color: "#718082", fontSize: 9, marginTop: 4 },
  permissionButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#355247" },
  permissionButtonText: { color: "#9FE3CC", fontSize: 9, fontWeight: "800" },
  storageCard: { borderRadius: 14, borderWidth: 1, borderColor: "#223032", backgroundColor: "#11191A", padding: 16 },
  storageTopline: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  storageValue: { color: "#F1F5F4", fontSize: 24, fontWeight: "900" },
  storageCaption: { color: "#718082", fontSize: 9, marginTop: 4 },
  storageLimit: { color: "#9FE3CC", fontSize: 9, fontWeight: "800" },
  storageTrack: { height: 7, borderRadius: 99, backgroundColor: "#263234", overflow: "hidden", marginTop: 16 },
  storageFill: { height: "100%", borderRadius: 99, backgroundColor: "#9FE3CC" },
  storagePolicy: { color: "#718082", fontSize: 9, lineHeight: 15, marginTop: 12 },
  addDeviceButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: "#355247" },
  addDeviceButtonText: { color: "#9FE3CC", fontSize: 9, fontWeight: "900" },
  registrationCard: { borderRadius: 14, borderWidth: 1, borderColor: "#2B3C38", backgroundColor: "#121C1A", padding: 15 },
  registrationTitle: { color: "#E7ECEB", fontSize: 12, fontWeight: "900" },
  registrationCopy: { color: "#718082", fontSize: 9, marginTop: 4, marginBottom: 8 },
  deviceInput: { minHeight: 43, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: "#2B383A", backgroundColor: "#0E1516", color: "#E5ECEB", fontSize: 10, paddingHorizontal: 12, outlineWidth: 0 },
  transportRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  transportButton: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#2B383A" },
  transportButtonActive: { backgroundColor: "#9FE3CC", borderColor: "#9FE3CC" },
  transportButtonText: { color: "#718082", fontSize: 8, fontWeight: "800" },
  transportButtonTextActive: { color: "#07110E", fontWeight: "900" },
  registerButton: { marginTop: 11, borderRadius: 10, backgroundColor: "#9FE3CC", alignItems: "center", paddingVertical: 11 },
  registerButtonText: { color: "#07110E", fontSize: 10, fontWeight: "900" },
  disabledAction: { opacity: 0.55 },
  deviceList: { gap: 10 },
  deviceCard: { borderRadius: 14, borderWidth: 1, borderColor: "#223032", backgroundColor: "#11191A", padding: 15 },
  deviceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  deviceIdentity: { flexDirection: "row", alignItems: "center", gap: 10 },
  deviceIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#1B312A", alignItems: "center", justifyContent: "center" },
  deviceIconText: { color: "#9FE3CC", fontSize: 10, fontWeight: "900" },
  deviceName: { color: "#E7ECEB", fontSize: 12, fontWeight: "900" },
  deviceId: { color: "#687779", fontSize: 8, marginTop: 3 },
  deviceStatus: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 99, backgroundColor: "#172A24" },
  deviceStatusError: { backgroundColor: "#2C1A1D" },
  deviceStatusDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: "#72D8B2" },
  deviceStatusText: { color: "#B9C8C5", fontSize: 8, fontWeight: "800" },
  deviceStats: { flexDirection: "row", marginTop: 16, borderTopWidth: 1, borderTopColor: "#273234", paddingTop: 13 },
  deviceStat: { flex: 1 },
  deviceStatLabel: { color: "#657477", fontSize: 8 },
  deviceStatValue: { color: "#DDE5E4", fontSize: 10, fontWeight: "800", marginTop: 4 },
  deviceStorageRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 15 },
  deviceStorageLabel: { color: "#657477", fontSize: 8 },
  deviceStorageValue: { color: "#9DAAAB", fontSize: 8, fontWeight: "700" },
  deviceStorageTrack: { height: 5, borderRadius: 99, backgroundColor: "#263234", overflow: "hidden", marginTop: 7 },
  deviceStorageFill: { height: "100%", borderRadius: 99, backgroundColor: "#72D8B2" },
  removeDeviceButton: { alignSelf: "flex-end", marginTop: 14, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: "#4B2D30" },
  removeDeviceButtonText: { color: "#D58489", fontSize: 8, fontWeight: "800" },
  noDeviceCard: { borderRadius: 14, borderWidth: 1, borderColor: "#223032", backgroundColor: "#11191A", padding: 22, alignItems: "center" },
  noDeviceTitle: { color: "#D8E0DF", fontSize: 11, fontWeight: "800" },
  noDeviceCopy: { color: "#718082", fontSize: 9, marginTop: 5 },
  noticeCard: { marginTop: 12, borderRadius: 14, padding: 15, backgroundColor: "#18201D", borderWidth: 1, borderColor: "#2A3732" },
  noticeTitle: { color: "#C6D3D2", fontSize: 11, fontWeight: "800" },
  noticeCopy: { color: "#899799", fontSize: 10, lineHeight: 16, marginTop: 6 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 15 },
  loadingText: { color: "#899799", fontSize: 11 },
  tabBar: { height: 70, borderTopWidth: 1, borderTopColor: "#1D292A", backgroundColor: "#0C1314", flexDirection: "row", paddingHorizontal: 18 },
  tabButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, outlineWidth: 0 },
  tabSymbol: { color: "#617073", fontSize: 20 },
  tabLabel: { color: "#617073", fontSize: 9, fontWeight: "700" },
  tabActive: { color: "#9FE3CC" },
});
