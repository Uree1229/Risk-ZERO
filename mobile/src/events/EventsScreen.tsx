import { useEvent } from "expo";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import type {
  EventCategory,
  EventLogItem,
  EventReview,
  VerificationDecision,
} from "../types";
import {
  buildMonthCells,
  eventDate,
  eventDateKey,
  eventsForDate,
  groupEvents,
  monthTitle,
  shiftMonth,
  toDateKey,
  type EventGroupMode,
} from "./calendar";
import {
  filterEvents,
  type EventCategoryFilter,
} from "./event-filter";

const decisionMeta: Record<
  VerificationDecision,
  { label: string; color: string; soft: string }
> = {
  pending: { label: "검증 대기", color: "#93A2A4", soft: "#182224" },
  pass: { label: "통과", color: "#72D8B2", soft: "#112A23" },
  inconclusive: { label: "판단 불가", color: "#F5C86C", soft: "#2B2618" },
  block: { label: "차단", color: "#FF6C73", soft: "#301A1D" },
};

const eventCategories: Array<{ id: EventCategory; label: string }> = [
  { id: "unclassified", label: "미분류" },
  { id: "resident", label: "현장 발화" },
  { id: "visitor", label: "음성 재생" },
  { id: "delivery", label: "영상 재생" },
  { id: "suspicious", label: "합성 의심" },
  { id: "intrusion", label: "품질 문제" },
  { id: "other", label: "기타" },
];

function categoryLabel(category?: EventCategory) {
  return (
    eventCategories.find((item) => item.id === category)?.label ?? "미분류"
  );
}

function reviewFor(event: EventLogItem): EventReview {
  return (
    event.review ?? {
      category: "unclassified",
      isFalseAlarm: false,
      isImportant: false,
      memo: "",
    }
  );
}

function eventDateLabel(event: EventLogItem) {
  const date = eventDate(event);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function EventCard({
  event,
  onPress,
  compact = false,
}: {
  event: EventLogItem;
  onPress: () => void;
  compact?: boolean;
}) {
  const meta = decisionMeta[event.decision];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title} 상세 보기`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventCard,
        compact && styles.eventCardCompact,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.eventIndicator, { backgroundColor: meta.color }]} />
      <View style={styles.eventBody}>
        <View style={styles.eventTopline}>
          <Text numberOfLines={1} style={styles.eventTitle}>
            {event.title}
          </Text>
          <Text style={styles.eventTime}>{event.occurredAt}</Text>
        </View>
        <Text numberOfLines={compact ? 1 : 2} style={styles.eventDetail}>
          {event.detail}
        </Text>
        <View style={styles.eventFooter}>
          <View style={styles.eventTags}>
            <Text style={[styles.eventLevel, { color: meta.color }]}>
              {meta.label} · {event.confidence === null ? "-" : `${Math.round(event.confidence * 100)}%`}
            </Text>
            {event.review?.category &&
            event.review.category !== "unclassified" ? (
              <Text style={styles.categoryTag}>
                {categoryLabel(event.review.category)}
              </Text>
            ) : null}
            {event.review?.isImportant ? (
              <Text style={styles.importantTag}>중요</Text>
            ) : null}
          </View>
          <Text style={styles.eventChevron}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

function EventVideoPlayer({ event }: { event: EventLogItem }) {
  const player = useVideoPlayer(
    event.video?.localUri ? { uri: event.video.localUri } : null,
    (videoPlayer) => {
      videoPlayer.loop = false;
    },
  );
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  if (!event.video) {
    return (
      <View style={styles.videoPlaceholder}>
        <View style={styles.placeholderMark}>
          <Text style={styles.placeholderMarkText}>▶</Text>
        </View>
        <Text style={styles.placeholderTitle}>연결된 영상이 없습니다</Text>
        <Text style={styles.placeholderCopy}>
          모듈에서 후처리 영상을 전달하면 이 영역에서 바로 재생됩니다.
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.placeholderButton,
            pressed && styles.pressed,
          ]}
          onPress={() =>
            Alert.alert(
              "영상 준비 중",
              "현재 이벤트에는 후처리 영상 파일이 연결되지 않았습니다.",
            )
          }
        >
          <Text style={styles.placeholderButtonText}>재생 기능 확인</Text>
        </Pressable>
      </View>
    );
  }

  const seek = (seconds: number) => {
    const nextTime = player.currentTime + seconds;
    const lastTime = player.duration > 0 ? player.duration : nextTime;
    player.currentTime = Math.max(0, Math.min(nextTime, lastTime));
  };

  return (
    <View>
      <VideoView
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        nativeControls
        player={player}
        style={styles.video}
      />
      <View style={styles.playerControls}>
        <Pressable
          style={({ pressed }) => [
            styles.controlButton,
            pressed && styles.pressed,
          ]}
          onPress={() => seek(-10)}
        >
          <Text style={styles.controlButtonText}>-10초</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.playButton,
            pressed && styles.pressed,
          ]}
          onPress={() => (isPlaying ? player.pause() : player.play())}
        >
          <Text style={styles.playButtonText}>
            {isPlaying ? "일시정지" : "재생"}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.controlButton,
            pressed && styles.pressed,
          ]}
          onPress={() => seek(10)}
        >
          <Text style={styles.controlButtonText}>+10초</Text>
        </Pressable>
      </View>
      <Text style={styles.fileMeta}>
        {event.video.fileName} · {formatDuration(event.video.durationMs)} ·{" "}
        {formatFileSize(event.video.sizeBytes)}
      </Text>
    </View>
  );
}

function EventDetail({
  event,
  onBack,
  onSaveReview,
}: {
  event: EventLogItem;
  onBack: () => void;
  onSaveReview: (review: EventReview) => Promise<void>;
}) {
  const meta = decisionMeta[event.decision];
  const [review, setReview] = useState<EventReview>(() => reviewFor(event));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setReview(reviewFor(event));
    setSaved(false);
  }, [event.id]);

  const saveReview = async () => {
    setSaving(true);
    try {
      await onSaveReview(review);
      setSaved(true);
    } catch (error) {
      Alert.alert(
        "분류 저장 실패",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.modalScroll}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>‹ 날짜 목록</Text>
      </Pressable>

      <Text style={styles.modalEyebrow}>EVENT DETAIL</Text>
      <Text style={styles.detailTitle}>{event.title}</Text>
      <Text style={styles.detailDate}>{eventDateLabel(event)}</Text>

      <View style={[styles.riskSummary, { borderColor: `${meta.color}55` }]}>
        <View>
          <Text style={styles.summaryCaption}>검증 판정</Text>
          <Text style={[styles.summaryLevel, { color: meta.color }]}>
            {meta.label}
          </Text>
        </View>
        <Text style={[styles.summaryScore, { color: meta.color }]}>
          {event.confidence === null ? "-" : Math.round(event.confidence * 100)}
          <Text style={styles.summaryScoreUnit}>%</Text>
        </Text>
      </View>

      <View style={styles.detailSection}>
        <Text style={styles.detailSectionLabel}>판정 내용</Text>
        <Text style={styles.detailCopy}>{event.detail}</Text>
      </View>

      <View style={styles.detailSection}>
        <View style={styles.detailSectionTopline}>
          <Text style={styles.detailSectionLabel}>이벤트 분류</Text>
          <Text style={styles.reviewStatus}>
            {saved ? "저장됨" : event.review ? "수정 가능" : "미분류"}
          </Text>
        </View>
        <View style={styles.categoryGrid}>
          {eventCategories.map((category) => {
            const active = review.category === category.id;
            return (
              <Pressable
                key={category.id}
                style={[
                  styles.categoryButton,
                  active && styles.categoryButtonActive,
                ]}
                onPress={() => {
                  setReview({ ...review, category: category.id });
                  setSaved(false);
                }}
              >
                <Text
                  style={[
                    styles.categoryButtonText,
                    active && styles.categoryButtonTextActive,
                  ]}
                >
                  {category.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.reviewToggleRow}>
          <Pressable
            style={[
              styles.reviewToggle,
              review.isImportant && styles.reviewToggleActive,
            ]}
            onPress={() => {
              setReview({ ...review, isImportant: !review.isImportant });
              setSaved(false);
            }}
          >
            <Text
              style={[
                styles.reviewToggleText,
                review.isImportant && styles.reviewToggleTextActive,
              ]}
            >
              ★ 중요 기록
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.reviewToggle,
              review.isFalseAlarm && styles.falseAlarmToggleActive,
            ]}
            onPress={() => {
              setReview({ ...review, isFalseAlarm: !review.isFalseAlarm });
              setSaved(false);
            }}
          >
            <Text
              style={[
                styles.reviewToggleText,
                review.isFalseAlarm && styles.falseAlarmToggleTextActive,
              ]}
            >
              오탐으로 표시
            </Text>
          </Pressable>
        </View>

        <TextInput
          multiline
          maxLength={300}
          placeholder="확인한 내용이나 메모를 입력하세요."
          placeholderTextColor="#536164"
          style={styles.memoInput}
          value={review.memo}
          onChangeText={(memo) => {
            setReview({ ...review, memo });
            setSaved(false);
          }}
        />
        <Pressable
          disabled={saving}
          style={[styles.reviewSaveButton, saving && styles.disabledButton]}
          onPress={() => void saveReview()}
        >
          <Text style={styles.reviewSaveButtonText}>
            {saving ? "저장 중" : "분류 저장"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.detailSection}>
        <View style={styles.detailSectionTopline}>
          <Text style={styles.detailSectionLabel}>후처리 영상</Text>
          <Text style={styles.videoStatus}>
            {event.video ? "재생 가능" : "입력 대기"}
          </Text>
        </View>
        <EventVideoPlayer key={event.id} event={event} />
      </View>
    </ScrollView>
  );
}

function ArchiveView({
  events,
  selectedDateKey,
  month,
  mode,
  onDate,
  onMonth,
  onMode,
  onEvent,
}: {
  events: EventLogItem[];
  selectedDateKey: string;
  month: Date;
  mode: EventGroupMode;
  onDate: (dateKey: string, date: Date) => void;
  onMonth: (month: Date) => void;
  onMode: (mode: EventGroupMode) => void;
  onEvent: (event: EventLogItem) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] =
    useState<EventCategoryFilter>("all");
  const monthCells = useMemo(() => buildMonthCells(month), [month]);
  const eventCountByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      const dateKey = eventDateKey(event);
      counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
    }
    return counts;
  }, [events]);
  const selectedEvents = useMemo(
    () => eventsForDate(events, selectedDateKey),
    [events, selectedDateKey],
  );
  const filteredEvents = useMemo(() => {
    return filterEvents(selectedEvents, searchQuery, categoryFilter);
  }, [categoryFilter, searchQuery, selectedEvents]);
  const groups = useMemo(
    () => groupEvents(filteredEvents, mode),
    [filteredEvents, mode],
  );
  const [, selectedMonth, selectedDay] = selectedDateKey
    .split("-")
    .map(Number);

  return (
    <ScrollView
      contentContainerStyle={styles.modalScroll}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.modalEyebrow}>EVENT ARCHIVE</Text>
      <Text style={styles.archiveTitle}>이벤트 상세 조회</Text>

      <View style={styles.calendarCard}>
        <View style={styles.monthHeader}>
          <Pressable
            accessibilityLabel="이전 달"
            style={styles.monthButton}
            onPress={() => onMonth(shiftMonth(month, -1))}
          >
            <Text style={styles.monthButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{monthTitle(month)}</Text>
          <Pressable
            accessibilityLabel="다음 달"
            style={styles.monthButton}
            onPress={() => onMonth(shiftMonth(month, 1))}
          >
            <Text style={styles.monthButtonText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {["일", "월", "화", "수", "목", "금", "토"].map((weekday) => (
            <Text key={weekday} style={styles.weekday}>
              {weekday}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {monthCells.map((cell) => {
            const selected = cell.dateKey === selectedDateKey;
            const eventCount = eventCountByDate.get(cell.dateKey) ?? 0;
            return (
              <Pressable
                key={cell.dateKey}
                accessibilityLabel={`${cell.dateKey}, 이벤트 ${eventCount}건`}
                style={styles.dayCell}
                onPress={() => onDate(cell.dateKey, cell.date)}
              >
                <View
                  style={[
                    styles.dayNumberWrap,
                    selected && styles.dayNumberSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      !cell.inCurrentMonth && styles.dayNumberMuted,
                      selected && styles.dayNumberSelectedText,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
                {eventCount > 0 ? (
                  <View
                    style={[
                      styles.eventDot,
                      selected && styles.eventDotSelected,
                    ]}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.resultHeader}>
        <View>
          <Text style={styles.resultDate}>
            {selectedMonth}월 {selectedDay}일
          </Text>
          <Text style={styles.resultCount}>
            {filteredEvents.length}건
            {filteredEvents.length !== selectedEvents.length
              ? ` / 전체 ${selectedEvents.length}건`
              : ""}
          </Text>
        </View>
        <View style={styles.modeSwitch}>
          {(
            [
              ["time", "시간대별"],
              ["decision", "판정별"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              style={[
                styles.modeButton,
                mode === value && styles.modeButtonActive,
              ]}
              onPress={() => onMode(value)}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === value && styles.modeButtonTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <TextInput
        placeholder="제목·내용·메모 검색"
        placeholderTextColor="#536164"
        style={styles.searchInput}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <ScrollView
        horizontal
        contentContainerStyle={styles.filterRow}
        showsHorizontalScrollIndicator={false}
      >
        {[
          { id: "all" as const, label: "전체" },
          { id: "important" as const, label: "중요" },
          ...eventCategories,
        ].map((filter) => {
          const active = categoryFilter === filter.id;
          return (
            <Pressable
              key={filter.id}
              style={[
                styles.filterButton,
                active && styles.filterButtonActive,
              ]}
              onPress={() => setCategoryFilter(filter.id)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  active && styles.filterButtonTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {groups.length > 0 ? (
        groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{group.label}</Text>
              <Text style={styles.groupCount}>{group.events.length}</Text>
            </View>
            <View style={styles.groupEvents}>
              {group.events.map((event) => (
                <EventCard
                  compact
                  event={event}
                  key={event.id}
                  onPress={() => onEvent(event)}
                />
              ))}
            </View>
          </View>
        ))
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>기록이 없습니다</Text>
          <Text style={styles.emptyCopy}>
            이벤트가 발생하면 이 날짜에 자동으로 분류됩니다.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

export function EventsScreen({
  events,
  onSaveReview,
}: {
  events: EventLogItem[];
  onSaveReview: (eventId: string, review: EventReview) => Promise<EventReview>;
}) {
  const latestEvent = events[0];
  const latestDate = latestEvent ? eventDate(latestEvent) : new Date();
  const [archiveVisible, setArchiveVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventLogItem | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState(
    toDateKey(latestDate),
  );
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(latestDate.getFullYear(), latestDate.getMonth(), 1),
  );
  const [groupMode, setGroupMode] = useState<EventGroupMode>("time");

  const openArchive = () => {
    const date = events[0] ? eventDate(events[0]) : new Date();
    setSelectedDateKey(toDateKey(date));
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setSelectedEvent(null);
    setArchiveVisible(true);
  };

  const openEvent = (event: EventLogItem) => {
    const date = eventDate(event);
    setSelectedDateKey(toDateKey(date));
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setSelectedEvent(event);
    setArchiveVisible(true);
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screenScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.screenHeader}>
          <View>
            <Text style={styles.eyebrow}>EVENTS</Text>
            <Text style={styles.pageTitle}>최근 이벤트</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.archiveButton,
              pressed && styles.pressed,
            ]}
            onPress={openArchive}
          >
            <Text style={styles.archiveButtonText}>상세 조회</Text>
          </Pressable>
        </View>

        <Text style={styles.screenDescription}>
          최근 기록을 누르면 판정 내용과 영상을 확인할 수 있습니다.
        </Text>

        <View style={styles.eventList}>
          {events.length > 0 ? (
            events.map((event) => (
              <EventCard
                event={event}
                key={event.id}
                onPress={() => openEvent(event)}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>아직 이벤트가 없습니다</Text>
              <Text style={styles.emptyCopy}>
                모듈에서 기록을 받으면 여기에 표시됩니다.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setArchiveVisible(false)}
        visible={archiveVisible}
      >
        <SafeAreaView
          edges={["top", "bottom"]}
          style={styles.modalSafeArea}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalBrand}>RISK-ZERO</Text>
            <Pressable
              accessibilityLabel="상세 조회 닫기"
              style={styles.closeButton}
              onPress={() => setArchiveVisible(false)}
            >
              <Text style={styles.closeButtonText}>닫기</Text>
            </Pressable>
          </View>
          {selectedEvent ? (
            <EventDetail
              event={selectedEvent}
              onBack={() => setSelectedEvent(null)}
              onSaveReview={async (review) => {
                const savedReview = await onSaveReview(
                  selectedEvent.id,
                  review,
                );
                setSelectedEvent((current) =>
                  current ? { ...current, review: savedReview } : current,
                );
              }}
            />
          ) : (
            <ArchiveView
              events={events}
              mode={groupMode}
              month={visibleMonth}
              selectedDateKey={selectedDateKey}
              onDate={(dateKey, date) => {
                setSelectedDateKey(dateKey);
                if (
                  date.getMonth() !== visibleMonth.getMonth() ||
                  date.getFullYear() !== visibleMonth.getFullYear()
                ) {
                  setVisibleMonth(
                    new Date(date.getFullYear(), date.getMonth(), 1),
                  );
                }
              }}
              onEvent={setSelectedEvent}
              onMode={setGroupMode}
              onMonth={setVisibleMonth}
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screenScroll: { padding: 20, paddingBottom: 34 },
  screenHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: "#9FE3CC",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  pageTitle: {
    color: "#F4F7F7",
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -1.2,
    marginTop: 10,
  },
  screenDescription: {
    color: "#7E8D8F",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 12,
  },
  archiveButton: {
    backgroundColor: "#9FE3CC",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  archiveButtonText: {
    color: "#07110E",
    fontSize: 11,
    fontWeight: "900",
  },
  eventList: { gap: 10, marginTop: 20 },
  eventCard: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#223032",
    backgroundColor: "#11191A",
  },
  eventCardCompact: { borderRadius: 12 },
  eventIndicator: { width: 4 },
  eventBody: { flex: 1, padding: 15 },
  eventTopline: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  eventTitle: {
    flex: 1,
    color: "#ECF1F1",
    fontSize: 12,
    fontWeight: "800",
  },
  eventTime: { color: "#657477", fontSize: 9 },
  eventDetail: {
    color: "#899799",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 7,
  },
  eventFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  eventTags: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  eventLevel: { fontSize: 9, fontWeight: "800" },
  categoryTag: {
    color: "#B6C2C1",
    fontSize: 8,
    fontWeight: "800",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#263234",
  },
  importantTag: {
    color: "#F5C86C",
    fontSize: 8,
    fontWeight: "900",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#2B2618",
  },
  eventChevron: { color: "#647376", fontSize: 20, lineHeight: 20 },
  pressed: { opacity: 0.72 },
  modalSafeArea: { flex: 1, backgroundColor: "#091011" },
  modalHeader: {
    height: 58,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#1D292A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalBrand: {
    color: "#9FE3CC",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: "#172122",
  },
  closeButtonText: { color: "#DDE5E4", fontSize: 10, fontWeight: "800" },
  modalScroll: { padding: 20, paddingBottom: 44 },
  modalEyebrow: {
    color: "#9FE3CC",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  archiveTitle: {
    color: "#F4F7F7",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -1,
    marginTop: 9,
    marginBottom: 20,
  },
  calendarCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#223032",
    backgroundColor: "#11191A",
    padding: 13,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  monthButton: {
    width: 38,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#182223",
  },
  monthButtonText: { color: "#DDE5E4", fontSize: 23, lineHeight: 24 },
  monthTitle: { color: "#EDF2F1", fontSize: 14, fontWeight: "900" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: {
    width: "14.285%",
    color: "#687779",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: "14.285%",
    height: 45,
    alignItems: "center",
    paddingTop: 4,
  },
  dayNumberWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumberSelected: { backgroundColor: "#9FE3CC" },
  dayNumber: { color: "#CBD4D3", fontSize: 10, fontWeight: "700" },
  dayNumberMuted: { color: "#455153" },
  dayNumberSelectedText: { color: "#07110E", fontWeight: "900" },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 4,
    backgroundColor: "#F5C86C",
    marginTop: 2,
  },
  eventDotSelected: { backgroundColor: "#9FE3CC" },
  resultHeader: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultDate: { color: "#F1F5F4", fontSize: 16, fontWeight: "900" },
  resultCount: { color: "#718082", fontSize: 9, marginTop: 3 },
  modeSwitch: {
    flexDirection: "row",
    borderRadius: 10,
    backgroundColor: "#151E1F",
    padding: 3,
  },
  modeButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  modeButtonActive: { backgroundColor: "#273536" },
  modeButtonText: { color: "#718082", fontSize: 9, fontWeight: "700" },
  modeButtonTextActive: { color: "#DDE6E5" },
  searchInput: {
    minHeight: 44,
    marginTop: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#273536",
    backgroundColor: "#11191A",
    color: "#E5ECEB",
    fontSize: 10,
    paddingHorizontal: 13,
    outlineWidth: 0,
  },
  filterRow: { gap: 7, paddingTop: 10, paddingBottom: 2 },
  filterButton: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#273536",
    backgroundColor: "#11191A",
  },
  filterButtonActive: { backgroundColor: "#9FE3CC", borderColor: "#9FE3CC" },
  filterButtonText: { color: "#7D8B8D", fontSize: 9, fontWeight: "700" },
  filterButtonTextActive: { color: "#07110E", fontWeight: "900" },
  group: { marginTop: 18 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  groupTitle: { color: "#BFCAC9", fontSize: 11, fontWeight: "800" },
  groupCount: {
    color: "#9FE3CC",
    fontSize: 8,
    fontWeight: "900",
    backgroundColor: "#152A24",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 99,
  },
  groupEvents: { gap: 8 },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#223032",
    backgroundColor: "#11191A",
    padding: 24,
    alignItems: "center",
    marginTop: 18,
  },
  emptyTitle: { color: "#D9E1E0", fontSize: 12, fontWeight: "800" },
  emptyCopy: {
    color: "#748386",
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 6,
  },
  backLink: { alignSelf: "flex-start", paddingVertical: 7, marginBottom: 12 },
  backLinkText: { color: "#9FE3CC", fontSize: 11, fontWeight: "800" },
  detailTitle: {
    color: "#F4F7F7",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -1,
    marginTop: 9,
  },
  detailDate: { color: "#718082", fontSize: 10, marginTop: 7 },
  riskSummary: {
    marginTop: 22,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#11191A",
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryCaption: {
    color: "#718082",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  summaryLevel: { fontSize: 20, fontWeight: "900", marginTop: 5 },
  summaryScore: { fontSize: 30, fontWeight: "900" },
  summaryScoreUnit: { color: "#637174", fontSize: 10 },
  detailSection: { marginTop: 25 },
  detailSectionTopline: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  detailSectionLabel: {
    color: "#C6D0CF",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 9,
  },
  detailCopy: {
    color: "#899799",
    fontSize: 12,
    lineHeight: 20,
    borderRadius: 14,
    backgroundColor: "#11191A",
    borderWidth: 1,
    borderColor: "#223032",
    padding: 16,
  },
  reviewStatus: { color: "#718082", fontSize: 9 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  categoryButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#2B383A",
    backgroundColor: "#11191A",
  },
  categoryButtonActive: {
    backgroundColor: "#9FE3CC",
    borderColor: "#9FE3CC",
  },
  categoryButtonText: { color: "#899799", fontSize: 9, fontWeight: "800" },
  categoryButtonTextActive: { color: "#07110E", fontWeight: "900" },
  reviewToggleRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  reviewToggle: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2B383A",
    backgroundColor: "#11191A",
  },
  reviewToggleActive: { borderColor: "#66582A", backgroundColor: "#2B2618" },
  falseAlarmToggleActive: { borderColor: "#74464A", backgroundColor: "#2C1A1D" },
  reviewToggleText: { color: "#899799", fontSize: 9, fontWeight: "800" },
  reviewToggleTextActive: { color: "#F5C86C" },
  falseAlarmToggleTextActive: { color: "#FF8B91" },
  memoInput: {
    minHeight: 82,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2B383A",
    backgroundColor: "#11191A",
    color: "#E5ECEB",
    fontSize: 10,
    lineHeight: 16,
    padding: 13,
    textAlignVertical: "top",
    outlineWidth: 0,
  },
  reviewSaveButton: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: "#9FE3CC",
    alignItems: "center",
    paddingVertical: 11,
  },
  reviewSaveButtonText: { color: "#07110E", fontSize: 10, fontWeight: "900" },
  disabledButton: { opacity: 0.55 },
  videoStatus: { color: "#718082", fontSize: 9 },
  videoPlaceholder: {
    minHeight: 235,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#273536",
    backgroundColor: "#101718",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  placeholderMark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A2C27",
  },
  placeholderMarkText: { color: "#9FE3CC", fontSize: 15, marginLeft: 2 },
  placeholderTitle: {
    color: "#E2E9E8",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 14,
  },
  placeholderCopy: {
    color: "#718082",
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 7,
  },
  placeholderButton: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#355247",
  },
  placeholderButtonText: {
    color: "#9FE3CC",
    fontSize: 10,
    fontWeight: "800",
  },
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: "#050808",
  },
  playerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  controlButton: {
    minWidth: 66,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: "#172122",
  },
  controlButtonText: { color: "#AAB5B4", fontSize: 10, fontWeight: "800" },
  playButton: {
    minWidth: 92,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 9,
    backgroundColor: "#9FE3CC",
  },
  playButtonText: { color: "#07110E", fontSize: 10, fontWeight: "900" },
  fileMeta: {
    color: "#657477",
    fontSize: 9,
    textAlign: "center",
    marginTop: 10,
  },
});
