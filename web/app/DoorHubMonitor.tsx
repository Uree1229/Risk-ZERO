"use client";

import { useCallback, useEffect, useState } from "react";
import { buildDoorHubDemo, doorHubScenarioOptions } from "@/lib/door-hub-demo";
import { recordsToDoorHubSnapshot, type DoorHubEventRecord, type DoorHubSnapshot, type SafetyDecision } from "@/lib/door-hub-domain";

const stageLabel: Record<DoorHubSnapshot["session"]["stage"], string> = {
  idle: "대기",
  "vision-wake": "Vision 기동",
  "camera-init": "카메라 준비",
  capture: "관찰 중",
  "end-background": "종료 배경 저장",
  "result-ready": "결과 준비됨",
  "vision-sleep": "Vision 절전",
  fault: "오류 고정",
};

const decisionLabel: Record<SafetyDecision, string> = {
  none: "요청 없음",
  allow: "허용",
  block: "차단",
  abort: "강제 차단",
};

function Flag({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={ok ? "hub-flag ok" : "hub-flag fault"}><i />{children}</span>;
}

export function DoorHubMonitor({ initialSnapshot }: { initialSnapshot: DoorHubSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [source, setSource] = useState<"demo" | "api">("demo");
  const [loading, setLoading] = useState(false);

  const loadDoorHub = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/door-hub-events?limit=8", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { data?: DoorHubEventRecord[] };
      const liveSnapshot = recordsToDoorHubSnapshot(payload.data ?? []);
      if (liveSnapshot) {
        setSnapshot(liveSnapshot);
        setSource("api");
      }
    } catch {
      setSource("demo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDoorHub(); }, [loadDoorHub]);

  return (
    <main className="hub-shell">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">RZ</span><div><strong>RISK-ZERO</strong><span>Door Hub Monitor</span></div></div>
        <nav className="hub-nav" aria-label="주요 화면">
          <a href="/trajectory">이전 동선 화면</a>
          <a href="/av">시청각 검증</a>
          <span className="demo-chip">{source === "api" ? "API" : "DEMO"}</span>
        </nav>
      </header>

      <section className="hub-intro">
        <div><p className="eyebrow">DOOR HUB EVENT</p><h1>현관 이벤트 모니터</h1><p>PIR로 시작한 방문 세션의 FPGA 영상 결과와 Safety 상태를 확인합니다.</p></div>
        <div className="scenario-controls"><span>시연 상황</span><div className="scenario-buttons">{doorHubScenarioOptions.map((scenario) => <button key={scenario.id} className={snapshot.scenarioId === scenario.id ? "active" : ""} onClick={() => { setSnapshot(buildDoorHubDemo(scenario.id)); setSource("demo"); }}>{scenario.label}</button>)}</div></div>
      </section>

      <section className="hub-flow" aria-label="시스템 데이터 흐름">
        <span>PIR · DVP Camera</span><b>→</b><span>Arty Vision</span><b>→</b><span>ESP32-S3 Door Hub</span><b>→</b><span>API · 앱</span>
      </section>

      <section className="hub-overview">
        <article className="hub-session-card">
          <div className="card-heading"><div><span className="card-kicker">EVENT #{snapshot.session.eventId}</span><h2>{stageLabel[snapshot.session.stage]}</h2></div><span className={`hub-stage stage-${snapshot.session.stage}`}>{snapshot.session.pirActive ? "PIR ACTIVE" : "PIR END"}</span></div>
          <div className="hub-presence"><span>방문자</span><strong>{snapshot.vision.visitorPresent ? "관찰 중" : "이탈 확인"}</strong><p>{snapshot.vision.primaryZone ? `마지막 구역 ${snapshot.vision.primaryZone}` : "구역 정보 없음"}</p></div>
          <dl className="hub-metrics">
            <div><dt>객체</dt><dd>{snapshot.vision.objectCount}개</dd></div>
            <div><dt>체류</dt><dd>{Math.round(snapshot.vision.dwellMs / 1000)}초</dd></div>
            <div><dt>배경 변화</dt><dd>{Math.round(snapshot.vision.backgroundChangeRatio * 100)}%</dd></div>
            <div><dt>Snapshot</dt><dd>{snapshot.vision.snapshotReady ? "준비됨" : "대기"}</dd></div>
          </dl>
        </article>

        <article className={`hub-safety-card decision-${snapshot.safety.decision}`}>
          <div className="card-heading"><div><span className="card-kicker">SAFETY GATE</span><h2>{decisionLabel[snapshot.safety.decision]}</h2></div><strong>{snapshot.safety.outputActive ? "LED ON" : "LED OFF"}</strong></div>
          <div className="hub-flags">
            <Flag ok={snapshot.safety.heartbeatOk}>Heartbeat</Flag>
            <Flag ok={snapshot.safety.doorClosed}>문 닫힘</Flag>
            <Flag ok={!snapshot.safety.tamperDetected}>Tamper 정상</Flag>
            <Flag ok={!snapshot.safety.emergencyStop}>E-stop 정상</Flag>
          </div>
          <div className="hub-safety-note"><span>판정 근거</span><p>{snapshot.safety.blockReason ?? "제어 요청이 없어 출력을 유지합니다."}</p></div>
        </article>
      </section>

      <section className="event-section hub-events">
        <div className="section-heading"><div><span className="card-kicker">EVENT LOG</span><h2>최근 Door Hub 이벤트</h2></div><div className="hub-event-actions"><span className="updated-at">{snapshot.deviceId}</span><button className="secondary-button" disabled={loading} onClick={() => void loadDoorHub()}>{loading ? "확인 중" : "API 새로고침"}</button></div></div>
        <div className="event-table" role="table">
          <div className="hub-event-row hub-event-header" role="row"><span>시간</span><span>이벤트</span><span>FPGA 결과</span><span>Safety</span></div>
          {snapshot.recentEvents.map((event) => <div className="hub-event-row" role="row" key={event.eventId}><span>{event.occurredAt}</span><strong>#{event.eventId} · {event.title}</strong><span>{event.detail}</span><span className={`hub-decision decision-${event.decision}`}>{decisionLabel[event.decision]}</span></div>)}
        </div>
      </section>
      <footer><span>{source === "api" ? "API · Door Hub 후처리 결과 표시" : "DEMO · 실제 PIR·Camera·FPGA·Door Hub 미연결"} · 제어 출력은 LED 기준</span></footer>
    </main>
  );
}
