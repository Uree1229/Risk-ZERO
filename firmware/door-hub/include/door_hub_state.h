#pragma once

#include <cstdint>
#include <optional>

namespace risk_zero {

enum class DoorHubStage : std::uint8_t {
  kIdle,
  kVisionWake,
  kCapture,
  kResultReady,
  kFault,
};

enum class SafetyDecision : std::uint8_t {
  kNone,
  kAllow,
  kBlock,
  kAbort,
};

struct VisionResult {
  bool visitor_present;
  std::uint16_t object_count;
  std::optional<std::uint8_t> primary_zone;
  std::uint16_t zone_mask;
  std::uint32_t dwell_ms;
  float background_change_ratio;
  bool background_changed;
  bool snapshot_ready;
  bool fault;
};

struct SafetyStatus {
  bool heartbeat_ok;
  bool auth_armed;
  SafetyDecision decision;
  bool fault_latched;
  bool door_closed;
  bool tamper_detected;
  bool emergency_stop;
  bool led_active;
};

struct DoorHubEvent {
  std::uint32_t event_id;
  DoorHubStage stage;
  bool pir_active;
  std::uint64_t started_at_ms;
  std::optional<std::uint64_t> ended_at_ms;
  VisionResult vision;
  SafetyStatus safety;
};

class DoorHubState {
 public:
  explicit DoorHubState(std::uint32_t next_event_id);

  std::uint32_t Start(std::uint64_t started_at_ms);
  bool BeginCapture(std::uint32_t event_id);
  bool Complete(std::uint32_t event_id,
                std::optional<std::uint64_t> ended_at_ms,
                const VisionResult& vision,
                const SafetyStatus& safety);

  [[nodiscard]] std::optional<std::uint32_t> active_event_id() const;
  [[nodiscard]] std::optional<DoorHubEvent> latest_event() const;

 private:
  static bool IsSafetyOutputValid(const SafetyStatus& safety);

  std::uint32_t next_event_id_;
  std::optional<DoorHubEvent> event_;
};

}  // namespace risk_zero
