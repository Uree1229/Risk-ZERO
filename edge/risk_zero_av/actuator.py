from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from .contracts import ActuationDecision, ControlRequest, VerificationAttempt, VerificationDecision


class ActuationGate:
    def __init__(self, pass_ttl_seconds: int = 3) -> None:
        self.pass_ttl_seconds = pass_ttl_seconds

    def decide(
        self,
        request: ControlRequest,
        attempt: VerificationAttempt,
        *,
        heartbeat_ok: bool,
        now: datetime | None = None,
    ) -> ActuationDecision:
        checked_at = now or datetime.now(timezone.utc)
        valid_until = attempt.evaluated_at + timedelta(seconds=self.pass_ttl_seconds)
        reason = "verified"
        allowed = True
        if attempt.request_id != request.id:
            allowed, reason = False, "request_mismatch"
        elif attempt.decision is not VerificationDecision.PASS:
            allowed, reason = False, f"verification_{attempt.decision.value}"
        elif not heartbeat_ok:
            allowed, reason = False, "heartbeat_missing"
        elif checked_at > valid_until or checked_at > request.expires_at:
            allowed, reason = False, "verification_expired"
        output = f"{request.intent}_pulse" if allowed and request.intent in ("unlock", "lock") else "none"
        return ActuationDecision(
            id=f"actuation_{uuid.uuid4().hex}",
            attempt_id=attempt.id,
            request_id=request.id,
            allowed=allowed,
            output=output,
            reason=reason,
            valid_until=valid_until,
        )


class MockActuator:
    def __init__(self) -> None:
        self.executions: list[ActuationDecision] = []

    def execute(self, decision: ActuationDecision, *, now: datetime | None = None) -> ActuationDecision:
        if not decision.allowed or decision.output == "none":
            self.executions.append(decision)
            return decision
        executed = replace(decision, executed_at=now or datetime.now(timezone.utc))
        self.executions.append(executed)
        return executed
