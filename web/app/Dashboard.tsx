"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResponseAction, SensorReading, SystemSnapshot, VerificationDecision } from "@/lib/domain";
import { scenarioOptions } from "@/lib/demo-runtime";

const decisionText: Record<VerificationDecision, string> = {
  pending: "검증 대기",
  pass: "통과",
  block: "차단",
  inconclusive: "판단 불가",
};

const actionText: Record<ResponseAction, string> = {
  standby: "제어 허용",
  local_alert: "차단 알림",
  camera_preview: "영상 확인",
  guardian_notice: "앱 확인",
  confirm_emergency_call: "대체 인증",
};

function readingValue(reading: SensorReading) {
  if (typeof reading.value === "boolean") return reading.value ? "감지" : "없음";
  return `${reading.value}${reading.unit ? ` ${reading.unit}` : ""}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function Dashboard({ initialSnapshot }: { initialSnapshot: SystemSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadScenario = useCallback(async (scenarioId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/snapshot?scenario=${scenarioId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("snapshot request failed");
      setSnapshot((await response.json()) as SystemSnapshot);
    } catch {
      setError("상태를 새로고침하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoPlay) return;
    const timer = window.setInterval(() => {
      const currentIndex = scenarioOptions.findIndex((item) => item.id === snapshot.scenarioId);
      const next = scenarioOptions[(currentIndex + 1) % scenarioOptions.length];
      void loadScenario(next.id);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [autoPlay, loadScenario, snapshot.scenarioId]);

  const score = Math.round((snapshot.verification.confidence ?? 0) * 100);
  const gaugeStyle = useMemo(
    () => ({ "--gauge-value": `${Math.max(0, Math.min(score, 100)) * 3.6}deg` }) as React.CSSProperties,
    [score],
  );

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">RZ</span>
          <div><strong>RISK-ZERO</strong><span>시청각 발화 검증</span></div>
        </div>
        <div className="topbar-status">
          <span className="live-dot" aria-hidden="true" />
          <button className="capture-link" type="button" onClick={() => { window.location.href = "/capture"; }}>입력 테스트</button>
          <span className="demo-chip">DEMO</span>
        </div>
      </header>

      <section className="intro-row">
        <div>
          <p className="eyebrow">AUDIO-VISUAL VERIFY</p>
          <h1>제어 요청 검증</h1>
        </div>
        <div className="scenario-controls" aria-label="상황 선택">
          <span>상황 선택</span>
          <div className="scenario-buttons">
            {scenarioOptions.map((scenario) => (
              <button
                data-testid={`scenario-${scenario.id}`}
                key={scenario.id}
                className={snapshot.scenarioId === scenario.id ? "active" : ""}
                onClick={() => void loadScenario(scenario.id)}
                disabled={loading}
              >{scenario.label}</button>
            ))}
          </div>
          <button
            className="autoplay-button"
            data-testid="autoplay-toggle"
            aria-pressed={autoPlay}
            onClick={() => setAutoPlay((current) => !current)}
          ><span aria-hidden="true">{autoPlay ? "Ⅱ" : "▶"}</span>{autoPlay ? "멈춤" : "자동 보기"}</button>
        </div>
      </section>

      {error ? <div className="error-banner" role="alert">{error}</div> : null}

      <section className="overview-grid">
        <article className={`risk-card level-${snapshot.assessment.level}`}>
          <div className="card-heading">
            <div><span className="card-kicker">검증 결과</span><h2>{decisionText[snapshot.verification.decision]}</h2></div>
            <span className="updated-at">{formatTime(snapshot.generatedAt)} 갱신</span>
          </div>
          <div className="risk-content">
            <div className="risk-gauge" style={gaugeStyle} aria-label={`검증 신뢰도 ${score}퍼센트`}>
              <div><strong>{score}</strong><span>%</span></div>
            </div>
            <div className="risk-copy">
              <p>{snapshot.verification.summary}</p>
              <div className="reason-list">{snapshot.assessment.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
            </div>
          </div>
          <div className="response-strip">
            <div><span>제어 게이트</span><p>{snapshot.response.message}</p></div>
            <div className="action-list">{snapshot.response.actions.map((action) => <span key={action}>{actionText[action]}</span>)}</div>
          </div>
        </article>

        <article className="sensor-panel">
          <div className="card-heading">
            <div><span className="card-kicker">EDGE EVIDENCE</span><h2>검증 수치</h2></div>
            <span className="source-chip">카메라·마이크</span>
          </div>
          <div className="sensor-grid">
            {snapshot.sensorEvent.readings.map((reading) => (
              <div className="sensor-tile" key={reading.id}>
                <span className="sensor-state" aria-hidden="true" />
                <span>{reading.label}</span><strong>{readingValue(reading)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="event-section">
        <div className="section-heading">
          <div><span className="card-kicker">EVENTS</span><h2>최근 이벤트</h2></div>
          <button className="secondary-button" onClick={() => void loadScenario(snapshot.scenarioId)}>새로고침</button>
        </div>
        <div className="event-table" role="table" aria-label="최근 이벤트">
          <div className="event-row event-header" role="row">
            <span role="columnheader">시간</span><span role="columnheader">상황</span><span role="columnheader">상세</span><span role="columnheader">판정</span><span role="columnheader">신뢰도</span>
          </div>
          {snapshot.recentEvents.map((event) => (
            <div className="event-row" role="row" key={event.id}>
              <span role="cell">{event.occurredAt}</span><strong role="cell">{event.title}</strong><span role="cell">{event.detail}</span>
              <span role="cell" className={`level-pill level-${event.level}`}>{decisionText[event.decision]}</span><strong role="cell">{event.confidence === null ? "-" : `${Math.round(event.confidence * 100)}%`}</strong>
            </div>
          ))}
        </div>
      </section>

      <footer><span>DEMO · 실제 모델·도어락 미연결</span></footer>
    </main>
  );
}
