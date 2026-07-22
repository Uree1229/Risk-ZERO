import { getD1 } from "@/db";
import { saveIncidentFeedback } from "@/db/data-repository";
import { DEMO_GUARDIAN_USER_ID, PayloadValidationError } from "@/lib/api-contract";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/api-response";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await readJsonBody(request);
    if (!isRecord(body) || typeof body.label !== "string") {
      throw new PayloadValidationError("label 값이 필요합니다.", "label");
    }
    if (body.note !== undefined && typeof body.note !== "string") {
      throw new PayloadValidationError("note는 문자열이어야 합니다.", "note");
    }
    if (typeof body.note === "string" && body.note.length > 500) {
      throw new PayloadValidationError("note는 500자 이하여야 합니다.", "note");
    }
    const { id } = await context.params;
    const result = await saveIncidentFeedback(await getD1(), id, {
      userId: typeof body.userId === "string" ? body.userId : DEMO_GUARDIAN_USER_ID,
      label: body.label,
      note: body.note as string | undefined,
    });
    return jsonResponse({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
