import { isRepositoryError } from "@/db/data-repository";
import { PayloadValidationError } from "@/lib/api-contract";

export function jsonResponse(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...init, headers });
}

export function errorResponse(error: unknown) {
  if (error instanceof PayloadValidationError) {
    return jsonResponse(
      { error: { code: "INVALID_PAYLOAD", message: error.message, field: error.field ?? null } },
      { status: 400 }
    );
  }
  if (isRepositoryError(error)) {
    return jsonResponse({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error("RISK-ZERO API error", error);
  return jsonResponse(
    { error: { code: "DATABASE_UNAVAILABLE", message: "데이터베이스 요청을 처리하지 못했습니다." } },
    { status: 503 }
  );
}

export async function readJsonBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 65_536) {
    throw new PayloadValidationError("요청 본문은 64KB 이하여야 합니다.");
  }
  try {
    return await request.json();
  } catch {
    throw new PayloadValidationError("올바른 JSON 요청이 아닙니다.");
  }
}
