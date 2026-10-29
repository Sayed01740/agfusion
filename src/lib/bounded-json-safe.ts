const MAX_DEPTH = 24;
const MAX_NODES = 4096;
const MAX_ARRAY_ITEMS = 256;
const MAX_OBJECT_KEYS = 256;
const MAX_STRING_LENGTH = 262144;
const TRUNCATED = "[Truncated]";

/**
 * Convert SDK estimate values to JSON-safe data with hard traversal limits.
 * This is intentionally bounded because SDK responses are external input.
 */
export function boundedJsonSafe(value: unknown): unknown {
  let visited = 0;
  const seen = new WeakSet<object>();

  function visit(current: unknown, depth: number): unknown {
    if (depth > MAX_DEPTH || visited >= MAX_NODES) return TRUNCATED;
    visited += 1;

    if (typeof current === "bigint") return current.toString();
    if (typeof current === "string") {
      return current.length > MAX_STRING_LENGTH
        ? current.slice(0, MAX_STRING_LENGTH) + TRUNCATED
        : current;
    }
    if (current === null || typeof current !== "object") return current;

    if (seen.has(current)) return "[Circular]";
    seen.add(current);

    if (Array.isArray(current)) {
      const result: unknown[] = [];
      const limit = Math.min(current.length, MAX_ARRAY_ITEMS);
      for (let i = 0; i < limit; i += 1) {
        result.push(visit(current[i], depth + 1));
        if (visited >= MAX_NODES) break;
      }
      if (current.length > limit) result.push(TRUNCATED);
      return result;
    }

    const result: Record<string, unknown> = {};
    let copied = 0;
    for (const key in current as Record<string, unknown>) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
      if (copied >= MAX_OBJECT_KEYS || visited >= MAX_NODES) {
        result.__truncated = true;
        break;
      }
      result[key] = visit((current as Record<string, unknown>)[key], depth + 1);
      copied += 1;
    }
    return result;
  }

  return visit(value, 0);
}
