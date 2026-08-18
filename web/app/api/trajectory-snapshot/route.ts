import { buildTrajectorySnapshot } from "@/lib/trajectory-demo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const scenario = new URL(request.url).searchParams.get("scenario") ?? "normal-delivery";
  return Response.json(await buildTrajectorySnapshot(scenario), {
    headers: { "Cache-Control": "no-store", "X-Risk-Zero-Data-Source": "trajectory-demo" },
  });
}
