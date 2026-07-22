import { getD1 } from "@/db";
import { getLatestIncident } from "@/db/data-repository";
import { DEMO_HOUSEHOLD_ID } from "@/lib/api-contract";
import { errorResponse, jsonResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const householdId = new URL(request.url).searchParams.get("householdId") ?? DEMO_HOUSEHOLD_ID;
    return jsonResponse({ data: await getLatestIncident(await getD1(), householdId) });
  } catch (error) {
    return errorResponse(error);
  }
}
