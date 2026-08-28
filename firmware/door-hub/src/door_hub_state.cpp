#include "door_hub_state.h"

namespace risk_zero {

namespace {

VisionResult EmptyVisionResult() {
  return VisionResult{false, 0, std::nullopt, 0, 0, 0.0F, false, false, false};
}

SafetyStatus SafeIdleStatus() {
  return SafetyStatus{false, false, SafetyDecision::kNone, false, false, false,
                      false, false};
}

}  // namespace

DoorHubState::DoorHubState(std::uint32_t next_event_id)
    : next_event_id_(next_event_id) {}

std::uint32_t DoorHubState::Start(std::uint64_t started_at_ms) {
  if (event_.has_value() && event_->pir_active) {
    return event_->event_id;
  }
  const std::uint32_t event_id = next_event_id_++;
  event_ = DoorHubEvent{event_id, DoorHubStage::kVisionWake, true, started_at_ms,
                        std::nullopt, EmptyVisionResult(), SafeIdleStatus()};
  return event_id;
}

bool DoorHubState::BeginCapture(std::uint32_t event_id) {
  if (!event_.has_value() || event_->event_id != event_id || !event_->pir_active) {
    return false;
  }
  event_->stage = DoorHubStage::kCapture;
  return true;
}

bool DoorHubState::Complete(std::uint32_t event_id,
                            std::optional<std::uint64_t> ended_at_ms,
                            const VisionResult& vision,
                            const SafetyStatus& safety) {
  if (!event_.has_value() || event_->event_id != event_id ||
      !IsSafetyOutputValid(safety)) {
    return false;
  }
  if (ended_at_ms.has_value() && ended_at_ms.value() < event_->started_at_ms) {
    return false;
  }
  if (vision.primary_zone.has_value() &&
      (vision.primary_zone.value() < 1 || vision.primary_zone.value() > 9)) {
    return false;
  }
  if (vision.zone_mask > 0x1FF || vision.background_change_ratio < 0.0F ||
      vision.background_change_ratio > 1.0F) {
    return false;
  }

  event_->ended_at_ms = ended_at_ms;
  event_->pir_active = !ended_at_ms.has_value();
  event_->vision = vision;
  event_->safety = safety;
  event_->stage = (vision.fault || safety.fault_latched)
                      ? DoorHubStage::kFault
                      : DoorHubStage::kResultReady;
  return true;
}

std::optional<std::uint32_t> DoorHubState::active_event_id() const {
  if (!event_.has_value() || !event_->pir_active) return std::nullopt;
  return event_->event_id;
}

std::optional<DoorHubEvent> DoorHubState::latest_event() const { return event_; }

bool DoorHubState::IsSafetyOutputValid(const SafetyStatus& safety) {
  if (!safety.led_active) return true;
  return safety.decision == SafetyDecision::kAllow && !safety.fault_latched &&
         !safety.tamper_detected && !safety.emergency_stop;
}

}  // namespace risk_zero
