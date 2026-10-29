export type LimitedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "invalid_json" };

/**
 * Reads a request body with a hard byte cap before JSON parsing.
 * Content-Length is only an early-rejection hint; the stream is always counted
 * because the header may be absent or inaccurate.
 */
export async function readLimitedJson(
  req: Request,
  maxBytes: number,
): Promise<LimitedJsonResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  const declaredLength = req.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const declared = Number(declaredLength);
    if (Number.isSafeInteger(declared) && declared > maxBytes) {
      try {
        await req.body?.cancel();
      } catch {
        // Best-effort cancellation; the size limit is still enforced below.
      }
      return { ok: false, reason: "too_large" };
    }
  }

  if (!req.body) return { ok: false, reason: "invalid_json" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid_json" };
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
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
