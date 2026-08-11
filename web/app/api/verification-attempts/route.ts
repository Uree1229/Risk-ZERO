import { getD1 } from "@/db";
import {
  ingestVerificationAttempt,
  listVerificationAttempts,
  normalizeLimit,
} from "@/db/data-repository";
import {
  DEMO_HOUSEHOLD_ID,
  parseVerificationAttemptPayload,
} from "@/lib/api-contract";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const householdId = url.searchParams.get("householdId") ?? DEMO_HOUSEHOLD_ID;
    const limit = normalizeLimit(url.searchParams.get("limit"), 50, 100);
    const attempts = await listVerificationAttempts(await getD1(), householdId, limit);
    return jsonResponse({ data: attempts, count: attempts.length });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = parseVerificationAttemptPayload(await readJsonBody(request));
    const result = await ingestVerificationAttempt(await getD1(), payload);
    return jsonResponse(
      { data: result },
      {
        status: result.duplicate ? 200 : 201,
        headers: { Location: `/api/verification-attempts?eventId=${encodeURIComponent(result.eventId)}` },
      }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
