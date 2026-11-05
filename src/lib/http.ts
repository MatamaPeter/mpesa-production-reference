import { NextResponse } from "next/server";
export class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function readJSON(req: Request, max = 24000) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new RequestError("Expected application/json", 415);
  const reader = req.body?.getReader();
  if (!reader) throw new RequestError("Missing request body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new RequestError("Request too large", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("Invalid JSON");
  }
}
export function apiError(error: unknown) {
  if (error instanceof RequestError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error("[API_FAILURE]", {
    type: error instanceof Error ? error.name : "unknown",
  });
  return NextResponse.json(
    { error: "Service temporarily unavailable. Please try again later." },
    { status: 503 },
  );
}
