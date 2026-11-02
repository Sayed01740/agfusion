export type LimitedTextResult =
  | { ok: true; value: string }
  | { ok: false; reason: "too_large" | "invalid_body" };

/**
 * Reads request text with a hard byte cap before buffering the complete body.
 * Content-Length is only an early-rejection hint; the stream is counted too.
 */
export async function readLimitedText(
  req: Request,
  maxBytes: number,
): Promise<LimitedTextResult> {
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
        // Best-effort cancellation; the hard limit remains enforced below.
      }
      return { ok: false, reason: "too_large" };
    }
  }

  // Preserve the existing proxy behavior for requests with no body.
  if (!req.body) return { ok: true, value: "" };

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
    return { ok: false, reason: "invalid_body" };
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
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "invalid_body" };
  }
}
