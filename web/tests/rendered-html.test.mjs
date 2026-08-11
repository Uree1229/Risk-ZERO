import assert from "node:assert/strict";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the RISK-ZERO monitoring page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const visibleHtml = html.split('<script id="_R_">')[0];
  assert.match(visibleHtml, /RISK-ZERO/);
  assert.match(visibleHtml, /제어 요청 검증/);
  assert.match(visibleHtml, /DEMO/);
  assert.match(visibleHtml, /최근 이벤트/);
  assert.doesNotMatch(visibleHtml, /SensorGateway|고정 더미 결과|교체 가능한 데이터 처리 흐름/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("server-renders the local camera and microphone capture page", async () => {
  const response = await render("/capture");
  assert.equal(response.status, 200);
  const html = await response.text();
  const visibleHtml = html.split('<script id="_R_">')[0];
  assert.match(visibleHtml, /시험 데이터 수집/);
  assert.match(visibleHtml, /영상과 실험 조건을 한 쌍으로 저장/);
  assert.match(visibleHtml, /검증 모델이나 서버로 전송하지 않습니다/);
  assert.match(visibleHtml, /참여자 코드/);
  assert.match(visibleHtml, /정상 발화/);
});

test("exposes the normalized demo snapshot API", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/snapshot?scenario=audio-replay"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "demo");
  assert.equal(payload.scenarioId, "audio-replay");
  assert.equal(payload.verification.decision, "block");
  assert.equal(payload.verification.policyVersion, "av-policy/0.1");
  assert.equal(payload.gate.allowed, false);
  assert.equal(payload.sensorEvent.source.provider, "DemoAVEdgeGateway");
});

test("rejects an invalid sensor payload before database access", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("invalid-api-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/sensor-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "INVALID_PAYLOAD");
  assert.equal(payload.error.field, "householdId");
});

test("rejects an invalid verification payload before database access", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("invalid-verification-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/verification-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "INVALID_PAYLOAD");
  assert.equal(payload.error.field, "controlRequest");
});

test("starter preview files are removed", async () => {
  const { access } = await import("node:fs/promises");
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", templateRoot)));
});
