import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getSnapshot } from "./src/api";
import { saveSnapshotLocally } from "./src/storage/local-database";
import type { RiskLevel, SensorReading, SystemSnapshot } from "./src/types";

type TabId = "home" | "events" | "settings";

const scenarios = [
  { id: "normal", label: "정상" },
  { id: "watch", label: "주의" },
  { id: "warning", label: "경고" },
  { id: "critical", label: "고위험" },
];

const levelMeta: Record<RiskLevel, { label: string; color: string; soft: string }> = {
  pending: { label: "판정 대기", color: "#93A2A4", soft: "#182224" },
  normal: { label: "정상", color: "#72D8B2", soft: "#112A23" },
  watch: { label: "주의", color: "#F5C86C", soft: "#2B2618" },
  warning: { label: "경고", color: "#FF9F68", soft: "#2F2019" },
  critical: { label: "고위험", color: "#FF6C73", soft: "#301A1D" },
};

function readingValue(reading: SensorReading) {
  if (typeof reading.value === "boolean") return reading.value ? "감지" : "없음";
  return `${reading.value}${reading.unit ? ` ${reading.unit}` : ""}`;
}

function MetricCard({ reading }: { reading: SensorReading }) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricLabel}>{reading.label}</Text>
        <View style={styles.onlineDot} />
      </View>
      <Text style={styles.metricValue}>{readingValue(reading)}</Text>
    </View>
  );
}

function HomeScreen({
  snapshot,
  source,
  refreshing,
  onRefresh,
  onScenario,
}: {
  snapshot: SystemSnapshot;
  source: "api" | "fallback";
  refreshing: boolean;
  onRefresh: () => void;
  onScenario: (scenarioId: string) => void;
}) {
  const meta = levelMeta[snapshot.assessment.level];
  const score = snapshot.assessment.score ?? 0;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9FE3CC" />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroCopy}>
        <Text style={styles.eyebrow}>HOME SAFETY</Text>
        <Text style={styles.title}>현관 상태</Text>
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

      <View style={[styles.riskCard, { borderColor: `${meta.color}55` }]}>
        <View style={styles.riskTopline}>
          <View>
            <Text style={styles.sectionLabel}>현재 상태</Text>
            <Text style={[styles.riskLabel, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <View style={[styles.sourceBadge, { backgroundColor: source === "api" ? "#143027" : "#2A2518" }]}>
            <View style={[styles.sourceDot, { backgroundColor: source === "api" ? "#72D8B2" : "#F5C86C" }]} />
            <Text style={styles.sourceText}>{source === "api" ? "ONLINE" : "OFFLINE"}</Text>
          </View>
        </View>

        <View style={styles.scoreRow}>
          <View style={[styles.scoreCircle, { borderColor: meta.color, backgroundColor: meta.soft }]}>
            <Text style={[styles.scoreNumber, { color: meta.color }]}>{score}</Text>
            <Text style={styles.scoreUnit}>/ 100</Text>
          </View>
          <View style={styles.scoreCopy}>
            <Text style={styles.summary}>{snapshot.assessment.summary}</Text>
            <View style={styles.reasonWrap}>
              {snapshot.assessment.reasons.map((reason) => <Text style={styles.reasonPill} key={reason}>{reason}</Text>)}
            </View>
          </View>
        </View>

        <View style={styles.responseBox}>
          <Text style={styles.responseLabel}>권장 조치</Text>
          <Text style={styles.responseMessage}>{snapshot.response.message}</Text>
          {snapshot.assessment.level === "critical" ? (
            <Pressable style={styles.confirmButton} onPress={() => Alert.alert("기능 준비 중", "긴급 신고 기능은 아직 연결되지 않았습니다.")}>
              <Text style={styles.confirmButtonText}>긴급 연락 안내</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.sectionTitleRow}>
        <View><Text style={styles.sectionLabel}>ENTRANCE SENSOR</Text><Text style={styles.sectionTitle}>감지 정보</Text></View>
        <Text style={styles.providerText}>현관 센서</Text>
      </View>
      <View style={styles.metricGrid}>{snapshot.sensorEvent.readings.map((reading) => <MetricCard key={reading.id} reading={reading} />)}</View>
    </ScrollView>
  );
}

function EventsScreen({ snapshot }: { snapshot: SystemSnapshot }) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>EVENTS</Text>
      <Text style={styles.pageTitle}>최근 이벤트</Text>
      <View style={styles.eventList}>
        {snapshot.recentEvents.map((event) => {
          const meta = levelMeta[event.level];
          return (
            <View style={styles.eventCard} key={event.id}>
              <View style={[styles.eventIndicator, { backgroundColor: meta.color }]} />
              <View style={styles.eventBody}>
                <View style={styles.eventTopline}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventTime}>{event.occurredAt}</Text>
                </View>
                <Text style={styles.eventDetail}>{event.detail}</Text>
                <Text style={[styles.eventLevel, { color: meta.color }]}>{meta.label} · {event.score ?? "-"}점</Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function SettingsScreen({ source }: { source: "api" | "fallback" }) {
  const rows = [
    ["실행 모드", "DEMO"],
    ["데이터 연결", source === "api" ? "온라인" : "오프라인"],
    ["알림", "미연결"],
    ["긴급 신고", "미연결"],
    ["앱 버전", "0.1.1"],
  ];
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>SETTINGS</Text>
      <Text style={styles.pageTitle}>앱 정보</Text>
      <View style={styles.settingsCard}>{rows.map(([label, value]) => <View style={styles.settingRow} key={label}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingValue}>{value}</Text></View>)}</View>
      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>데모 버전</Text>
        <Text style={styles.noticeCopy}>시나리오 데이터로 동작하며 알림과 신고는 연결되지 않습니다.</Text>
      </View>
    </ScrollView>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [scenarioId, setScenarioId] = useState("normal");
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [source, setSource] = useState<"api" | "fallback">("fallback");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (nextScenario = scenarioId) => {
    setRefreshing(true);
    const result = await getSnapshot(nextScenario);
    setSnapshot(result.snapshot);
    setSource(result.source);
    try {
      await saveSnapshotLocally(result.snapshot);
    } catch (error) {
      console.warn("Failed to save the mobile snapshot.", error);
    }
    setRefreshing(false);
  }, [scenarioId]);

  useEffect(() => { void load("normal"); }, []);

  const selectScenario = useCallback((nextScenario: string) => {
    setScenarioId(nextScenario);
    void load(nextScenario);
  }, [load]);

  const content = useMemo(() => {
    if (!snapshot) return <View style={styles.loading}><ActivityIndicator color="#9FE3CC" size="large" /><Text style={styles.loadingText}>현관 상태를 불러오는 중</Text></View>;
    if (activeTab === "events") return <EventsScreen snapshot={snapshot} />;
    if (activeTab === "settings") return <SettingsScreen source={source} />;
    return <HomeScreen snapshot={snapshot} source={source} refreshing={refreshing} onRefresh={() => void load()} onScenario={selectScenario} />;
  }, [activeTab, load, refreshing, selectScenario, snapshot, source]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.brandRow}><View style={styles.brandMark}><Text style={styles.brandMarkText}>RZ</Text></View><View><Text style={styles.brandName}>RISK-ZERO</Text><Text style={styles.brandSub}>현관 안전 모니터</Text></View></View>
        <View style={styles.demoBadge}><View style={styles.onlineDot} /><Text style={styles.demoBadgeText}>DEMO</Text></View>
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
  pageTitle: { color: "#F4F7F7", fontSize: 30, lineHeight: 38, fontWeight: "800", letterSpacing: -1.2, marginTop: 10 },
  scenarioRow: { gap: 8, paddingVertical: 18 },
  scenarioButton: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: "#243234", backgroundColor: "#0F1718", outlineWidth: 0 },
  scenarioButtonActive: { backgroundColor: "#9FE3CC", borderColor: "#9FE3CC" },
  scenarioText: { color: "#9DAAAB", fontSize: 11, fontWeight: "700" },
  scenarioTextActive: { color: "#07110E" },
  riskCard: { borderWidth: 1, borderRadius: 20, padding: 18, backgroundColor: "#11191A" },
  riskTopline: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  sectionLabel: { color: "#778587", fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  riskLabel: { fontSize: 23, fontWeight: "800", marginTop: 5 },
  sourceBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  sourceDot: { width: 5, height: 5, borderRadius: 99 },
  sourceText: { color: "#D5E0DF", fontSize: 8, fontWeight: "800", letterSpacing: .6 },
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
  eventList: { gap: 10, marginTop: 24 },
  eventCard: { flexDirection: "row", overflow: "hidden", borderRadius: 14, borderWidth: 1, borderColor: "#223032", backgroundColor: "#11191A" },
  eventIndicator: { width: 4 },
  eventBody: { flex: 1, padding: 15 },
  eventTopline: { flexDirection: "row", justifyContent: "space-between" },
  eventTitle: { color: "#ECF1F1", fontSize: 12, fontWeight: "800" },
  eventTime: { color: "#657477", fontSize: 9 },
  eventDetail: { color: "#899799", fontSize: 10, marginTop: 7 },
  eventLevel: { fontSize: 9, fontWeight: "800", marginTop: 10 },
  settingsCard: { marginTop: 24, borderRadius: 14, borderWidth: 1, borderColor: "#223032", backgroundColor: "#11191A", overflow: "hidden" },
  settingRow: { minHeight: 52, paddingHorizontal: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#283436" },
  settingLabel: { color: "#899799", fontSize: 10 },
  settingValue: { color: "#E5ECEB", fontSize: 10, fontWeight: "700" },
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
