import type {
  ModuleBufferStatus,
  ModuleDevice,
  ModuleEvent,
  ModuleEventBatch,
  ModuleEventDraft,
  ModuleGateway,
} from "./contracts";

function assertNonNegativeInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

function copyEvent(event: ModuleEvent): ModuleEvent {
  return {
    ...event,
    metrics: event.metrics.map((metric) => ({ ...metric })),
    video: event.video ? { ...event.video } : undefined,
  };
}

/**
 * 실제 모듈 플래시의 순환 버퍼 동작을 메모리로 모델링한 구현입니다.
 */
export class InMemoryModuleEventBuffer implements ModuleGateway {
  private readonly retainedEvents: ModuleEvent[] = [];
  private readonly device: ModuleDevice;
  private readonly capacity: number;
  private latestSequence = 0;
  private acknowledgedThroughSequence = 0;
  private droppedThroughSequence = 0;

  constructor(device: ModuleDevice, capacity = 300) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("capacity must be a positive integer.");
    }
    this.device = device;
    this.capacity = capacity;
  }

  append(draft: ModuleEventDraft): ModuleEvent {
    if (draft.metrics.some((metric) => !Number.isFinite(metric.value))) {
      throw new TypeError("Every processed metric value must be a finite number.");
    }
    this.latestSequence += 1;
    const event: ModuleEvent = {
      ...draft,
      id: `${this.device.id}:${this.latestSequence}`,
      deviceId: this.device.id,
      sequence: this.latestSequence,
      dedupeKey: draft.dedupeKey ?? `${this.device.id}:${this.latestSequence}`,
      metrics: draft.metrics.map((metric) => ({ ...metric })),
      video: draft.video ? { ...draft.video } : undefined,
    };

    this.retainedEvents.push(event);
    if (this.retainedEvents.length > this.capacity) {
      const dropped = this.retainedEvents.shift();
      if (dropped) {
        this.droppedThroughSequence = Math.max(
          this.droppedThroughSequence,
          dropped.sequence,
        );
      }
    }

    return copyEvent(event);
  }

  async getDevice() {
    return { ...this.device };
  }

  async pullEvents(afterSequence: number, limit: number): Promise<ModuleEventBatch> {
    assertNonNegativeInteger(afterSequence, "afterSequence");
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError("limit must be a positive integer.");
    }

    const available = this.retainedEvents.filter(
      (event) => event.sequence > afterSequence,
    );
    const events = available.slice(0, limit).map(copyEvent);

    return {
      deviceId: this.device.id,
      events,
      oldestAvailableSequence:
        this.retainedEvents[0]?.sequence ?? this.latestSequence + 1,
      latestSequence: this.latestSequence,
      acknowledgedThroughSequence: this.acknowledgedThroughSequence,
      droppedThroughSequence: this.droppedThroughSequence,
      hasMore: available.length > events.length,
    };
  }

  async acknowledgeThrough(sequence: number) {
    assertNonNegativeInteger(sequence, "sequence");
    if (sequence > this.latestSequence) {
      throw new RangeError("Cannot acknowledge an event that does not exist.");
    }
    if (sequence <= this.acknowledgedThroughSequence) return;

    this.acknowledgedThroughSequence = sequence;
    while (
      this.retainedEvents[0] &&
      this.retainedEvents[0].sequence <= sequence
    ) {
      this.retainedEvents.shift();
    }
  }

  getStatus(): ModuleBufferStatus {
    return {
      capacity: this.capacity,
      retainedEventCount: this.retainedEvents.length,
      latestSequence: this.latestSequence,
      acknowledgedThroughSequence: this.acknowledgedThroughSequence,
      droppedThroughSequence: this.droppedThroughSequence,
    };
  }
}
