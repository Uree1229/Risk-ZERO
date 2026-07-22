"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResponseAction, RiskLevel, SensorReading, SystemSnapshot } from "@/lib/domain";
import { scenarioOptions } from "@/lib/demo-runtime";

const levelText: Record<RiskLevel, string> = {
  pending: "판정 대기",
  normal: "정상",
  watch: "주의",
  warning: "경고",
  critical: "고위험",
};

const actionText: Record<ResponseAction, string> = {
  standby: "대기 유지",
  local_alert: "실내 알림",
  camera_preview: "카메라 미리보기",
  guardian_notice: "보호자 알림",
  confirm_emergency_call: "신고 확인 요청",
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
      setError("새 더미 데이터를 불러오지 못했습니다. 현재 화면을 유지합니다.");
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

  const score = snapshot.assessment.score ?? 0;
  const gaugeStyle = useMemo(
    () => ({ "--gauge-value": `${Math.max(0, Math.min(score, 100)) * 3.6}deg` }) as React.CSSProperties,
    [score],
  );

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">RZ</span>
          <div><strong>RISK-ZERO</strong><span>현관 안전 모니터</span></div>
        </div>
        <div className="topbar-status">
          <span className="live-dot" aria-hidden="true" />
          <span>시스템 연결됨</span><span className="divider" />
          <span className="demo-chip">DEMO MODE</span>
        </div>
      </header>

      <section className="intro-row">
        <div>
          <p className="eyebrow">LIVE SAFETY OVERVIEW</p>
          <h1>현관 상태를 한눈에 확인하세요.</h1>
          <p className="intro-copy">센서 계층과 위험도 로직을 분리한 테스트 화면입니다. 현재 점수는 계산식이 아닌 고정된 시연 값입니다.</p>
        </div>
        <div className="scenario-controls" aria-label="테스트 시나리오 선택">
          <span>테스트 시나리오</span>
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
          ><span aria-hidden="true">{autoPlay ? "Ⅱ" : "▶"}</span>{autoPlay ? "자동 재생 멈춤" : "시나리오 자동 재생"}</button>
        </div>
      </section>

      {error ? <div className="error-banner" role="alert">{error}</div> : null}

      <section className="overview-grid">
        <article className={`risk-card level-${snapshot.assessment.level}`}>
          <div className="card-heading">
            <div><span className="card-kicker">현재 위험 상태</span><h2>{levelText[snapshot.assessment.level]}</h2></div>
            <span className="updated-at">{formatTime(snapshot.generatedAt)} 갱신</span>
          </div>
          <div className="risk-content">
            <div className="risk-gauge" style={gaugeStyle} aria-label={`더미 위험도 ${score}점`}>
              <div><strong>{score}</strong><span>/ 100</span></div>
            </div>
            <div className="risk-copy">
              <span className="dummy-label">고정 더미 결과</span>
              <p>{snapshot.assessment.summary}</p>
              <div className="reason-list">{snapshot.assessment.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
            </div>
          </div>
          <div className="response-strip">
            <div><span>대응 미리보기</span><p>{snapshot.response.message}</p></div>
            <div className="action-list">{snapshot.response.actions.map((action) => <span key={action}>{actionText[action]}</span>)}</div>
          </div>
        </article>

        <article className="sensor-panel">
          <div className="card-heading">
            <div><span className="card-kicker">정규화된 입력</span><h2>센서 데이터</h2></div>
            <span className="source-chip">{snapshot.sensorEvent.source.provider}</span>
          </div>
          <div className="sensor-grid">
            {snapshot.sensorEvent.readings.map((reading) => (
              <div className="sensor-tile" key={reading.id}>
                <span className="sensor-state" aria-hidden="true" />
                <span>{reading.label}</span><strong>{readingValue(reading)}</strong><small>{reading.metric}</small>
              </div>
            ))}
          </div>
          <div className="adapter-note">
            <span>연동 지점</span>
            <p>실제 센서 계층은 <code>SensorGateway</code>만 구현하면 동일한 화면에 연결됩니다.</p>
          </div>
        </article>
      </section>

      <section className="pipeline-section">
        <div className="section-heading">
          <div><span className="card-kicker">SW ARCHITECTURE</span><h2>교체 가능한 데이터 처리 흐름</h2></div>
          <span className="engine-state">위험도 로직 미확정</span>
        </div>
        <div className="pipeline-grid">
          {snapshot.pipeline.map((stage, index) => (
            <div className="pipeline-stage" key={stage.id}>
              <div className={`stage-number state-${stage.state}`}>{index + 1}</div>
              <div><strong>{stage.label}</strong><span>{stage.detail}</span></div>
              {index < snapshot.pipeline.length - 1 ? <span className="stage-arrow" aria-hidden="true">→</span> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="event-section">
        <div className="section-heading">
          <div><span className="card-kicker">TEST EVENT LOG</span><h2>최근 시연 이벤트</h2></div>
          <button className="secondary-button" onClick={() => void loadScenario(snapshot.scenarioId)}>더미 데이터 새로고침</button>
        </div>
        <div className="event-table" role="table" aria-label="최근 시연 이벤트">
          <div className="event-row event-header" role="row">
            <span role="columnheader">시간</span><span role="columnheader">상황</span><span role="columnheader">상세</span><span role="columnheader">위험도</span><span role="columnheader">점수</span>
          </div>
          {snapshot.recentEvents.map((event) => (
            <div className="event-row" role="row" key={event.id}>
              <span role="cell">{event.occurredAt}</span><strong role="cell">{event.title}</strong><span role="cell">{event.detail}</span>
              <span role="cell" className={`level-pill level-${event.level}`}>{levelText[event.level]}</span><strong role="cell">{event.score ?? "-"}</strong>
            </div>
          ))}
        </div>
      </section>

      <footer><span>RISK-ZERO CAPSTONE MVP</span><span>실제 장치 제어와 긴급 신고는 실행하지 않습니다.</span></footer>
    </main>
  );
}
