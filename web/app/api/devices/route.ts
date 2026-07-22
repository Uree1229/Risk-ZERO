import { getD1 } from "@/db";
import { listDevices } from "@/db/data-repository";
import { DEMO_HOUSEHOLD_ID } from "@/lib/api-contract";
import { errorResponse, jsonResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const householdId = new URL(request.url).searchParams.get("householdId") ?? DEMO_HOUSEHOLD_ID;
    const devices = await listDevices(await getD1(), householdId);
    return jsonResponse({ data: devices, count: devices.length });
  } catch (error) {
    return errorResponse(error);
  }
}
