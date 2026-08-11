export const CAPTURE_MANIFEST_VERSION = "av-capture-manifest/1";

export const CAPTURE_SCENARIOS = [
  { id: "bona-fide", label: "정상 발화" },
  { id: "audio-replay", label: "녹음 음성 재생" },
  { id: "screen-replay", label: "화면 영상 재생" },
  { id: "av-delay", label: "음성·입모양 지연" },
  { id: "mouth-occlusion", label: "입 주변 가림" },
  { id: "background-noise", label: "배경 소음" },
] as const;

export type CaptureScenarioId = (typeof CAPTURE_SCENARIOS)[number]["id"];

export interface CaptureManifest {
  schemaVersion: typeof CAPTURE_MANIFEST_VERSION;
  sessionId: string;
  participantCode: string;
  scenario: CaptureScenarioId;
  challengePhrase: string;
  capturedAt: {
    started: string;
    ended: string;
    durationMs: number;
  };
  media: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  };
  source: "browser-local";
  verificationStatus: "not_evaluated";
}

interface CaptureManifestInput {
  sessionId: string;
  participantCode: string;
  scenario: CaptureScenarioId;
  challengePhrase: string;
  startedAt: Date;
  endedAt: Date;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function createCaptureManifest(input: CaptureManifestInput): CaptureManifest {
  const participantCode = input.participantCode.trim();
  const challengePhrase = input.challengePhrase.trim();
  const durationMs = input.endedAt.getTime() - input.startedAt.getTime();

  if (!input.sessionId.trim()) throw new Error("sessionId is required");
  if (!participantCode) throw new Error("participantCode is required");
  if (!challengePhrase) throw new Error("challengePhrase is required");
  if (!input.fileName.trim()) throw new Error("fileName is required");
  if (!input.mimeType.trim()) throw new Error("mimeType is required");
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 0) throw new Error("sizeBytes must be non-negative");
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error("endedAt must not be before startedAt");

  return {
    schemaVersion: CAPTURE_MANIFEST_VERSION,
    sessionId: input.sessionId,
    participantCode,
    scenario: input.scenario,
    challengePhrase,
    capturedAt: {
      started: input.startedAt.toISOString(),
      ended: input.endedAt.toISOString(),
      durationMs,
    },
    media: {
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    },
    source: "browser-local",
    verificationStatus: "not_evaluated",
  };
}

export function captureFileStem(sessionId: string, scenario: CaptureScenarioId, startedAt: Date) {
  const timestamp = `${startedAt.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12) || "session";
  return `risk-zero_${timestamp}_${scenario}_${safeSessionId}`;
}

export function mediaFileExtension(mimeType: string) {
  return mimeType.toLowerCase().includes("mp4") ? "mp4" : "webm";
}
