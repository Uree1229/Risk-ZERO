import { getD1 } from "@/db";
import { listIncidents, normalizeLimit } from "@/db/data-repository";
import { DEMO_HOUSEHOLD_ID } from "@/lib/api-contract";
import { errorResponse, jsonResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const householdId = url.searchParams.get("householdId") ?? DEMO_HOUSEHOLD_ID;
    const limit = normalizeLimit(url.searchParams.get("limit"), 30, 100);
    const requestedStatus = url.searchParams.get("status");
    const status = requestedStatus && ["open", "monitoring", "closed"].includes(requestedStatus)
      ? requestedStatus
      : undefined;
    const incidents = await listIncidents(await getD1(), householdId, { limit, status });
    return jsonResponse({ data: incidents, count: incidents.length });
  } catch (error) {
    return errorResponse(error);
  }
}
