"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonTrajectory, TrajectoryDecision, TrajectorySnapshot } from "@/lib/trajectory-domain";
import { trajectoryScenarioOptions } from "@/lib/trajectory-demo";
import { buildFpgaTrajectorySnapshot, parseFpgaMotionStatus } from "@/lib/fpga-motion";

const decisionLabel: Record<TrajectoryDecision, string> = {
  normal: "정상 동선",
  watch: "경계 필요",
  alert: "확인 필요",
  inconclusive: "판단 불가",
};

const trackColors = ["#9fe3cc", "#ffb06f", "#8fb8ff"];

function drawTrajectory(canvas: HTMLCanvasElement, tracks: PersonTrajectory[]) {
  const width = Math.max(canvas.clientWidth, 320);
  const height = Math.round(width * 0.64);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(ratio, ratio);
  context.fillStyle = "#070d0e";
  context.fillRect(0, 0, width, height);

  const zone = (x: number, y: number, w: number, h: number, color: string, label: string) => {
    context.fillStyle = color;
    context.fillRect(x * width, y * height, w * width, h * height);
    context.fillStyle = "rgba(225,239,237,.55)";
    context.font = `${Math.max(10, width * 0.013)}px sans-serif`;
    context.fillText(label, x * width + 10, y * height + 20);
  };
  zone(0.02, 0.72, 0.24, 0.24, "rgba(86,211,173,.06)", "복도 출입");
  zone(0.40, 0.25, 0.27, 0.31, "rgba(143,184,255,.06)", "현관");
  zone(0.52, 0.53, 0.21, 0.20, "rgba(245,200,108,.06)", "택배 구역");
  zone(0.80, 0.27, 0.18, 0.47, "rgba(255,108,115,.07)", "사각지대");

  context.strokeStyle = "rgba(213,232,230,.18)";
  context.lineWidth = 2;
  context.strokeRect(0.015 * width, 0.03 * height, 0.97 * width, 0.93 * height);
  context.beginPath();
  context.moveTo(0.39 * width, 0.04 * height);
  context.lineTo(0.39 * width, 0.45 * height);
  context.lineTo(0.69 * width, 0.45 * height);
  context.stroke();

  tracks.forEach((track, index) => {
    const color = trackColors[index % trackColors.length];
    context.strokeStyle = color;
    context.lineWidth = Math.max(3, width * 0.004);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    track.points.forEach((point, pointIndex) => {
      const x = point.x * width;
      const y = point.y * height;
      if (pointIndex === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    track.points.forEach((point, pointIndex) => {
      const x = point.x * width;
      const y = point.y * height;
      context.fillStyle = pointIndex === track.points.length - 1 ? "#fff" : color;
      context.beginPath();
      context.arc(x, y, pointIndex === track.points.length - 1 ? 6 : 3, 0, Math.PI * 2);
      context.fill();
    });
    const last = track.points[track.points.length - 1];
    context.fillStyle = color;
    context.font = `700 ${Math.max(10, width * 0.014)}px sans-serif`;
    const labelOnLeft = last.x > 0.82;
    context.textAlign = labelOnLeft ? "right" : "left";
    context.fillText(track.id, last.x * width + (labelOnLeft ? -10 : 10), last.y * height - 9);
    context.textAlign = "left";
  });
}

function formatSeconds(milliseconds: number) {
  return `${Math.round(milliseconds / 1000)}초`;
}

export function TrajectoryMonitor({ initialSnapshot }: { initialSnapshot: TrajectorySnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fpgaAddress, setFpgaAddress] = useState("192.168.0.40");
  const [fpgaConnected, setFpgaConnected] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadScenario = useCallback(async (scenario: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/trajectory-snapshot?scenario=${scenario}`, { cache: "no-store" });
      if (!response.ok) throw new Error("trajectory snapshot failed");
      setSnapshot((await response.json()) as TrajectorySnapshot);
      setFpgaConnected(false);
    } catch {
      setError("동선 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFpga = useCallback(async (address: string) => {
    const normalized = address.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (!normalized) throw new Error("Arty A7 IP를 입력하세요.");
    if (window.location.protocol === "https:") {
      throw new Error("FPGA 연결은 같은 네트워크의 HTTP 개발 화면에서 사용할 수 있습니다.");
    }
    const response = await fetch(`http://${normalized}/trajectory`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error("Arty A7이 응답하지 않습니다.");
    setSnapshot(buildFpgaTrajectorySnapshot(parseFpgaMotionStatus(await response.json())));
    setFpgaAddress(normalized);
  }, []);

  const connectFpga = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadFpga(fpgaAddress);
      setFpgaConnected(true);
    } catch (reason) {
      setFpgaConnected(false);
      setError(reason instanceof Error ? reason.message : "Arty A7 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [fpgaAddress, loadFpga]);

  useEffect(() => {
    if (!fpgaConnected) return;
    const timer = window.setInterval(() => {
      void loadFpga(fpgaAddress).catch(() => {
        setFpgaConnected(false);
        setError("Arty A7 연결이 끊겼습니다.");
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [fpgaAddress, fpgaConnected, loadFpga]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => drawTrajectory(canvas, snapshot.observation.tracks);
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [snapshot.observation.tracks]);

  const primaryTrack = snapshot.observation.tracks[0];
  return (
    <main className="trajectory-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">RZ</span>
          <div><strong>RISK-ZERO</strong><span>현관 동선 모니터</span></div>
        </div>
        <div className="topbar-status">
          <span className="live-dot" aria-hidden="true" />
          <span>{fpgaConnected ? "Arty A7 연결됨" : "ESP32-CAM · Arty A7 연결 대기"}</span>
          <button className="capture-link" type="button" onClick={() => { window.location.href = "/av"; }}>시청각 검증</button>
          <span className="demo-chip">{snapshot.mode === "fpga" ? "FPGA" : "DEMO"}</span>
        </div>
      </header>

      <section className="trajectory-intro">
        <div><p className="eyebrow">ENTRANCE TRAJECTORY</p><h1>방문 동선 확인</h1><p>사람의 진입·체류·이탈 경로를 확인합니다. 범죄 의도나 신원을 판정하지 않습니다.</p></div>
        <div className="scenario-controls" aria-label="동선 상황 선택">
          <span>상황 선택</span>
          <div className="scenario-buttons">
            {trajectoryScenarioOptions.map((scenario) => (
              <button key={scenario.id} className={snapshot.scenarioId === scenario.id ? "active" : ""} disabled={loading} onClick={() => void loadScenario(scenario.id)}>{scenario.label}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="fpga-connect-panel" aria-label="Arty A7 연결">
        <div><span className="card-kicker">HARDWARE</span><strong>Arty A7-100T</strong><p>같은 공유기에 Ethernet으로 연결된 보드 IP를 입력합니다.</p></div>
        <label><span>보드 IP</span><input value={fpgaAddress} onChange={(event) => setFpgaAddress(event.target.value)} placeholder="192.168.0.40" inputMode="decimal" /></label>
        <button type="button" disabled={loading} onClick={() => void connectFpga()}>{fpgaConnected ? "다시 연결" : "FPGA 연결"}</button>
        {fpgaConnected ? <button className="secondary-button" type="button" onClick={() => setFpgaConnected(false)}>연결 해제</button> : null}
      </section>
      {error ? <div className="error-banner" role="alert">{error}</div> : null}

      <section className="trajectory-overview">
        <article className="trajectory-map-card">
          <div className="card-heading"><div><span className="card-kicker">CAMERA VIEW</span><h2>사람별 이동 경로</h2></div><span className="source-chip">{snapshot.observation.frame.width} × {snapshot.observation.frame.height}</span></div>
          <canvas ref={canvasRef} className="trajectory-canvas" aria-label="현관 구역과 사람 이동 경로" />
          <div className="trajectory-legend">{snapshot.observation.tracks.map((track, index) => <span key={track.id}><i style={{ background: trackColors[index % trackColors.length] }} />{track.id}</span>)}</div>
        </article>

        <article className={`trajectory-assessment level-${snapshot.assessment.decision}`}>
          <div className="card-heading"><div><span className="card-kicker">TRAJECTORY RESULT</span><h2>{decisionLabel[snapshot.assessment.decision]}</h2></div><strong className="trajectory-score">{snapshot.assessment.anomalyScore}</strong></div>
          <p>{snapshot.assessment.summary}</p>
          <div className="reason-list">{snapshot.assessment.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
          <dl className="trajectory-metrics">
            <div><dt>진입</dt><dd>{snapshot.observation.counts.entered}명</dd></div>
            <div><dt>이탈</dt><dd>{snapshot.observation.counts.exited}명</dd></div>
            <div><dt>화면 내</dt><dd>{snapshot.observation.counts.visible}명</dd></div>
            <div><dt>체류</dt><dd>{primaryTrack ? formatSeconds(primaryTrack.dwellMs) : "-"}</dd></div>
          </dl>
          <div className="trajectory-response"><span>대응</span><p>{snapshot.response.message}</p><div>{snapshot.response.actions.map((action) => <b key={action}>{action}</b>)}</div></div>
        </article>
      </section>

      <section className="event-section trajectory-events">
        <div className="section-heading"><div><span className="card-kicker">EVENTS</span><h2>최근 동선 이벤트</h2></div><button className="secondary-button" onClick={() => void (snapshot.mode === "fpga" ? connectFpga() : loadScenario(snapshot.scenarioId))}>새로고침</button></div>
        <div className="event-table" role="table" aria-label="최근 동선 이벤트">
          <div className="trajectory-event-row trajectory-event-header" role="row"><span>시간</span><span>상황</span><span>상세</span><span>판정</span></div>
          {snapshot.recentEvents.map((event) => <div className="trajectory-event-row" role="row" key={event.id}><span>{event.occurredAt}</span><strong>{event.title}</strong><span>{event.detail}</span><span className={`trajectory-decision decision-${event.decision}`}>{decisionLabel[event.decision]}</span></div>)}
        </div>
      </section>
      <footer><span>{snapshot.mode === "fpga" ? "FPGA · 움직임 후보 추적이며 사람 분류 결과가 아님" : "DEMO · 실제 사람 검출 모델·ESP32-CAM 미연결"}</span></footer>
    </main>
  );
}
