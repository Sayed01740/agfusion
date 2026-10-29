export type LimitedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: "invalid_json" | "payload_too_large" };

/**
 * Read untrusted JSON with a hard byte limit before parsing. This bounds memory
 * use for API requests even when Content-Length is missing or untrustworthy.
 */
export async function readLimitedJson(
  request: Request,
  maxBytes: number,
): Promise<LimitedJsonResult> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    return { ok: false, status: 413, error: "payload_too_large" };
  }

  if (!request.body) {
    return { ok: false, status: 400, error: "invalid_json" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413, error: "payload_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}
