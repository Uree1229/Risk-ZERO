"use client";

import { useEffect, useRef, useState } from "react";
import {
  CAPTURE_SCENARIOS,
  captureFileStem,
  createCaptureManifest,
  mediaFileExtension,
  type CaptureManifest,
  type CaptureScenarioId,
} from "@/lib/capture-manifest";

const challengePhrases = [
  "초록 우산 문 열어",
  "파란 구름 잠금 해제",
  "노란 별 현관 열어",
  "빨간 나무 문 열어",
];

type CaptureState = "idle" | "requesting" | "ready" | "recording" | "captured" | "error";

interface RecordingContext {
  sessionId: string;
  participantCode: string;
  scenario: CaptureScenarioId;
  challengePhrase: string;
  startedAt: Date;
}

interface CaptureResult {
  mediaUrl: string;
  manifestUrl: string;
  manifest: CaptureManifest;
}

function pickChallenge(current: string) {
  const candidates = challengePhrases.filter((phrase) => phrase !== current);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? challengePhrases[0];
}

export function CaptureLab() {
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingContextRef = useRef<RecordingContext | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<CaptureState>("idle");
  const [challenge, setChallenge] = useState(challengePhrases[0]);
  const [participantCode, setParticipantCode] = useState("P01");
  const [scenario, setScenario] = useState<CaptureScenarioId>("bona-fide");
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devicesActive, setDevicesActive] = useState(false);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (result) {
        URL.revokeObjectURL(result.mediaUrl);
        URL.revokeObjectURL(result.manifestUrl);
      }
    };
  }, [result]);

  async function prepareCapture() {
    setState("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play();
      }
      setDevicesActive(true);
      setState("ready");
    } catch {
      setDevicesActive(false);
      setError("카메라와 마이크 권한을 확인해주세요.");
      setState("error");
    }
  }

  function stopRecording() {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") {
      setError("이 브라우저에서는 동시 녹화를 사용할 수 없습니다.");
      setState("error");
      return;
    }

    if (!participantCode.trim()) {
      setError("참여자 코드를 입력해주세요. 이름 대신 P01 같은 코드를 사용합니다.");
      return;
    }

    setError(null);
    setResult(null);
    chunksRef.current = [];
    const preferredType = "video/webm;codecs=vp8,opus";
    const recorder = MediaRecorder.isTypeSupported(preferredType)
      ? new MediaRecorder(stream, { mimeType: preferredType })
      : new MediaRecorder(stream);
    recorderRef.current = recorder;
    recordingContextRef.current = {
      sessionId: crypto.randomUUID(),
      participantCode: participantCode.trim(),
      scenario,
      challengePhrase: challenge,
      startedAt: new Date(),
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const context = recordingContextRef.current;
      const endedAt = new Date();
      const mimeType = recorder.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (!context) {
        setError("녹화 정보를 만들지 못했습니다. 다시 촬영해주세요.");
        setState("error");
        return;
      }

      const fileStem = captureFileStem(context.sessionId, context.scenario, context.startedAt);
      const fileName = `${fileStem}.${mediaFileExtension(mimeType)}`;
      const manifest = createCaptureManifest({
        ...context,
        endedAt,
        fileName,
        mimeType,
        sizeBytes: blob.size,
      });
      const manifestBlob = new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: "application/json" });
      setResult({
        mediaUrl: URL.createObjectURL(blob),
        manifestUrl: URL.createObjectURL(manifestBlob),
        manifest,
      });
      recordingContextRef.current = null;
      setState("captured");
    };
    recorder.start(250);
    setState("recording");
    stopTimerRef.current = window.setTimeout(stopRecording, 8_000);
  }

  function closeDevices() {
    stopRecording();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    setDevicesActive(false);
    setState(result ? "captured" : "idle");
  }

  return (
    <main className="capture-shell">
      <header className="capture-topbar">
        <button type="button" className="back-link" onClick={() => { window.location.href = "/"; }}>← 모니터링</button>
        <span className="demo-chip">LOCAL CAPTURE</span>
      </header>

      <section className="capture-heading">
        <p className="eyebrow">CAMERA + MICROPHONE</p>
        <h1>시험 데이터 수집</h1>
        <p>영상과 실험 조건을 한 쌍으로 저장합니다. 파일은 이 브라우저에서만 만들어지며 검증 모델이나 서버로 전송하지 않습니다.</p>
      </section>

      <section className="capture-grid">
        <article className="capture-panel">
          <div className="capture-preview">
            <video ref={previewRef} muted playsInline aria-label="실시간 카메라 미리보기" />
            {!devicesActive ? <span>카메라 대기</span> : null}
            {state === "recording" ? <strong className="recording-badge">● 녹화 중 · 최대 8초</strong> : null}
          </div>
          <div className="capture-actions">
            {state === "idle" || state === "error" ? <button onClick={() => void prepareCapture()}>카메라·마이크 켜기</button> : null}
            {(state === "ready" || state === "captured") && devicesActive ? <button onClick={startRecording}>녹화 시작</button> : null}
            {state === "recording" ? <button className="danger-button" onClick={stopRecording}>녹화 종료</button> : null}
            {devicesActive ? <button className="secondary-button" onClick={closeDevices}>장치 끄기</button> : null}
          </div>
          {error ? <p className="capture-error" role="alert">{error}</p> : null}
        </article>

        <div className="capture-side-stack">
          <aside className="capture-config-panel">
            <span>실험 조건</span>
            <label>
              참여자 코드
              <input
                value={participantCode}
                maxLength={24}
                disabled={state === "recording"}
                onChange={(event) => setParticipantCode(event.target.value)}
                placeholder="예: P01"
              />
            </label>
            <label>
              촬영 유형
              <select value={scenario} disabled={state === "recording"} onChange={(event) => setScenario(event.target.value as CaptureScenarioId)}>
                {CAPTURE_SCENARIOS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <p>실명은 입력하지 않습니다. 같은 참여자는 같은 코드를 사용해주세요.</p>
          </aside>

          <aside className="challenge-panel">
            <span>이번 문구</span>
            <strong>{challenge}</strong>
            <p>화면을 보며 문구를 자연스럽게 한 번 읽어주세요.</p>
            <button className="secondary-button" disabled={state === "recording"} onClick={() => setChallenge(pickChallenge(challenge))}>새 문구</button>
          </aside>
        </div>
      </section>

      {result ? (
        <section className="recorded-panel">
          <div><span className="card-kicker">CAPTURED PAIR</span><h2>영상·메타데이터 확인</h2></div>
          <div className="capture-result-grid">
            <video src={result.mediaUrl} controls playsInline aria-label="녹화된 시청각 클립" />
            <dl>
              <div><dt>상태</dt><dd>미평가</dd></div>
              <div><dt>참여자</dt><dd>{result.manifest.participantCode}</dd></div>
              <div><dt>유형</dt><dd>{CAPTURE_SCENARIOS.find((item) => item.id === result.manifest.scenario)?.label}</dd></div>
              <div><dt>길이</dt><dd>{(result.manifest.capturedAt.durationMs / 1_000).toFixed(1)}초</dd></div>
              <div><dt>세션</dt><dd>{result.manifest.sessionId.slice(0, 12)}</dd></div>
            </dl>
          </div>
          <div className="capture-result-row">
            <span>두 파일을 같은 폴더에 보관해주세요.</span>
            <a href={result.mediaUrl} download={result.manifest.media.fileName}>영상 저장</a>
            <a href={result.manifestUrl} download={`${result.manifest.media.fileName.replace(/\.[^.]+$/, "")}.json`}>정보 JSON 저장</a>
          </div>
        </section>
      ) : null}
    </main>
  );
}
