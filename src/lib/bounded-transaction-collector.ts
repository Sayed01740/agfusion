export type PreparedTransaction = { to: string; data: string; value?: string };

const MAX_TRAVERSAL_DEPTH = 24;
const MAX_VISITED_NODES = 2048;
const MAX_TRANSACTIONS = 64;

/**
 * Extract executable transaction payloads from an SDK estimate without
 * allowing unexpectedly deep or broad response objects to monopolize CPU
 * or recurse until the call stack is exhausted.
 */
export function collectTransactions(value: unknown): PreparedTransaction[] {
  const out: PreparedTransaction[] = [];
  const seen = new Set<string>();
  let visitedNodes = 0;

  function visit(current: unknown, depth: number): void {
    if (
      depth > MAX_TRAVERSAL_DEPTH ||
      visitedNodes >= MAX_VISITED_NODES ||
      out.length >= MAX_TRANSACTIONS
    ) return;

    visitedNodes += 1;

    if (Array.isArray(current)) {
      const limit = Math.min(current.length, MAX_VISITED_NODES - visitedNodes);
      for (let i = 0; i < limit; i += 1) {
        if (visitedNodes >= MAX_VISITED_NODES || out.length >= MAX_TRANSACTIONS) break;
        visit(current[i], depth + 1);
      }
      return;
    }

    if (!current || typeof current !== "object") return;
    const obj = current as Record<string, unknown>;
    const to = typeof obj.to === "string"
      ? obj.to
      : typeof obj.contractAddress === "string"
        ? obj.contractAddress
        : undefined;
    const data = typeof obj.data === "string"
      ? obj.data
      : typeof obj.callData === "string"
        ? obj.callData
        : undefined;

    if (
      to &&
      data &&
      /^0x[0-9a-fA-F]{40}$/.test(to) &&
      /^0x[0-9a-fA-F]*$/.test(data)
    ) {
      const valueField = typeof obj.value === "string"
        ? obj.value
        : typeof obj.amount === "string"
          ? obj.amount
          : undefined;
      const key = `${to.toLowerCase()}:${data.toLowerCase()}:${valueField || "0"}`;
      if (!seen.has(key) && out.length < MAX_TRANSACTIONS) {
        seen.add(key);
        out.push({ to, data, ...(valueField ? { value: valueField } : {}) });
      }
    }

    // Iterate lazily so a very broad object does not first allocate a huge
    // Object.values() array. Every visited child consumes the shared budget.
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      if (visitedNodes >= MAX_VISITED_NODES || out.length >= MAX_TRANSACTIONS) break;
      visit(obj[key], depth + 1);
    }
  }

  visit(value, 0);
  return out;
}
