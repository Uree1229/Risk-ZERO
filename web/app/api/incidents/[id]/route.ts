import { getD1 } from "@/db";
import { getIncidentDetail } from "@/db/data-repository";
import { errorResponse, jsonResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return jsonResponse({ data: await getIncidentDetail(await getD1(), id) });
  } catch (error) {
    return errorResponse(error);
  }
}
