from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from .contracts import ChallengeSession


DEFAULT_PHRASES = (
    "초록 우산",
    "파란 우체통",
    "노란 자전거",
    "하얀 구름",
    "일곱 두 다섯 아홉",
)


class ChallengeService:
    def __init__(self, ttl_seconds: int = 15) -> None:
        if ttl_seconds < 1:
            raise ValueError("ttl_seconds must be positive")
        self.ttl_seconds = ttl_seconds
        self._sessions: dict[str, ChallengeSession] = {}

    def issue(
        self,
        *,
        now: datetime | None = None,
        phrase: str | None = None,
        challenge_id: str | None = None,
        nonce: str | None = None,
    ) -> ChallengeSession:
        issued_at = now or datetime.now(timezone.utc)
        session = ChallengeSession(
            id=challenge_id or f"challenge_{secrets.token_urlsafe(9)}",
            phrase=phrase or secrets.choice(DEFAULT_PHRASES),
            nonce=nonce or secrets.token_urlsafe(16),
            issued_at=issued_at,
            expires_at=issued_at + timedelta(seconds=self.ttl_seconds),
        )
        self._sessions[session.id] = session
        return session

    def get(self, challenge_id: str) -> ChallengeSession | None:
        return self._sessions.get(challenge_id)

    def consume(self, challenge_id: str, *, now: datetime | None = None) -> str | None:
        session = self._sessions.get(challenge_id)
        consumed_at = now or datetime.now(timezone.utc)
        if session is None:
            return "challenge_missing"
        if session.used_at is not None:
            return "nonce_replayed"
        if consumed_at > session.expires_at:
            return "challenge_expired"
        session.used_at = consumed_at
        return None
