"use client";

import { useEffect, useRef, useState } from "react";

const challengePhrases = [
  "초록 우산 문 열어",
  "파란 구름 잠금 해제",
  "노란 별 현관 열어",
  "빨간 나무 문 열어",
];

type CaptureState = "idle" | "requesting" | "ready" | "recording" | "captured" | "error";

function pickChallenge(current: string) {
  const candidates = challengePhrases.filter((phrase) => phrase !== current);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? challengePhrases[0];
}

export function CaptureLab() {
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<CaptureState>("idle");
  const [challenge, setChallenge] = useState(challengePhrases[0]);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
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
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

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

    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    chunksRef.current = [];
    const preferredType = "video/webm;codecs=vp8,opus";
    const recorder = MediaRecorder.isTypeSupported(preferredType)
      ? new MediaRecorder(stream, { mimeType: preferredType })
      : new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
      setRecordedUrl(URL.createObjectURL(blob));
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
    setState(recordedUrl ? "captured" : "idle");
  }

  return (
    <main className="capture-shell">
      <header className="capture-topbar">
        <button type="button" className="back-link" onClick={() => { window.location.href = "/"; }}>← 모니터링</button>
        <span className="demo-chip">LOCAL CAPTURE</span>
      </header>

      <section className="capture-heading">
        <p className="eyebrow">CAMERA + MICROPHONE</p>
        <h1>입력 수집 테스트</h1>
        <p>카메라와 마이크가 같은 구간을 녹화하는지만 확인합니다. 아직 시청각 검증 모델에는 전송하지 않습니다.</p>
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

        <aside className="challenge-panel">
          <span>이번 문구</span>
          <strong>{challenge}</strong>
          <p>화면을 보며 문구를 자연스럽게 한 번 읽어주세요.</p>
          <button className="secondary-button" disabled={state === "recording"} onClick={() => setChallenge(pickChallenge(challenge))}>새 문구</button>
        </aside>
      </section>

      {recordedUrl ? (
        <section className="recorded-panel">
          <div><span className="card-kicker">CAPTURED CLIP</span><h2>녹화 확인</h2></div>
          <video src={recordedUrl} controls playsInline aria-label="녹화된 시청각 클립" />
          <div className="capture-result-row">
            <span>상태</span><strong>모델 입력 준비</strong>
            <a href={recordedUrl} download="risk-zero-av-capture.webm">테스트 파일 저장</a>
          </div>
        </section>
      ) : null}
    </main>
  );
}
