import { getD1 } from "@/db";
import { ingestDoorHubEvent, listDoorHubEvents, normalizeLimit } from "@/db/data-repository";
import { DEMO_HOUSEHOLD_ID, parseDoorHubEventPayload } from "@/lib/api-contract";
import { jsonResponse, errorResponse, readJsonBody } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const householdId = url.searchParams.get("householdId") ?? DEMO_HOUSEHOLD_ID;
    const limit = normalizeLimit(url.searchParams.get("limit"), 30, 100);
    const events = await listDoorHubEvents(await getD1(), householdId, limit);
    return jsonResponse({ data: events, count: events.length });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = parseDoorHubEventPayload(await readJsonBody(request));
    const result = await ingestDoorHubEvent(await getD1(), payload);
    return jsonResponse({ data: result }, { status: result.updated ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
