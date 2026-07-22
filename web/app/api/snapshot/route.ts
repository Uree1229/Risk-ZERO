import { getD1 } from "@/db";
import { buildDatabaseSnapshot } from "@/db/data-repository";
import { buildDemoSnapshot } from "@/lib/demo-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const scenarioId = new URL(request.url).searchParams.get("scenario") ?? "normal";
  let snapshot;
  let source = "d1";

  try {
    snapshot = await buildDatabaseSnapshot(await getD1(), scenarioId);
  } catch (error) {
    const isPlainNodeFallback =
      error instanceof Error && "code" in error && error.code === "ERR_UNSUPPORTED_ESM_URL_SCHEME";
    if (!isPlainNodeFallback) console.warn("D1 demo snapshot unavailable; using in-memory fallback", error);
    snapshot = await buildDemoSnapshot(scenarioId);
    source = "memory-fallback";
  }

  return Response.json(snapshot, {
    headers: { "Cache-Control": "no-store", "X-Risk-Zero-Data-Source": source },
  });
}
