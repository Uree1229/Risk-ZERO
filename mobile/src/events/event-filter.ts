import type { EventCategory, EventLogItem } from "../types";

export type EventCategoryFilter = EventCategory | "all" | "important";

export function filterEvents(
  events: EventLogItem[],
  searchQuery: string,
  categoryFilter: EventCategoryFilter,
) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ko-KR");
  return events.filter((event) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      `${event.title} ${event.detail} ${event.review?.memo ?? ""}`
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedQuery);
    const matchesCategory =
      categoryFilter === "all" ||
      (categoryFilter === "important"
        ? event.review?.isImportant === true
        : (event.review?.category ?? "unclassified") === categoryFilter);
    return matchesQuery && matchesCategory;
  });
}
