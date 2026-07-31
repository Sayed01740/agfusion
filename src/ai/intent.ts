import type { IntentType, ParsedIntent, StableToken } from "@/types";
import { resolveChain } from "@/lib/chains";

const TOKENS: StableToken[] = ["USDC", "EURC", "USDT", "USDe", "DAI", "PYUSD"];

function extractAmount(text: string): string | undefined {
  const m =
    text.match(/\$\s*([\d,]+(?:\.\d+)?)/i) ||
    text.match(/([\d,]+(?:\.\d+)?)\s*(?:usdc|eurc|usdt|usd|dollars?)/i) ||
    text.match(/\b([\d,]+(?:\.\d+)?)\b/);
  if (!m) return undefined;
  return m[1].replace(/,/g, "");
}

function extractToken(text: string, fallback: StableToken = "USDC"): StableToken {
  const upper = text.toUpperCase();
  for (const t of TOKENS) {
    if (upper.includes(t)) return t;
  }
  if (/\beur\b|euro/i.test(text)) return "EURC";
  return fallback;
}

function extractTokensPair(text: string): {
  token?: StableToken;
  tokenOut?: StableToken;
} {
  const swapMatch = text.match(
    /(USDC|EURC|USDT|USDE|DAI|PYUSD)\s*(?:to|→|->|for)\s*(USDC|EURC|USDT|USDE|DAI|PYUSD)/i,
  );
  if (swapMatch) {
    return {
      token: swapMatch[1].toUpperCase() as StableToken,
      tokenOut: swapMatch[2].toUpperCase() as StableToken,
    };
  }
  return { token: extractToken(text) };
}

function extractRecipient(text: string): {
  recipient?: string;
  recipientLabel?: string;
} {
  const addr = text.match(/0x[a-fA-F0-9]{40}/);
  if (addr) return { recipient: addr[0] };

  // Prefer "... to Name" (case-insensitive): Send 10 USDC to sarah
  const toName = text.match(
    /\bto\s+([a-z][\w.-]{1,24})(?:\s+on\s+\w+)?\s*$/i,
  ) || text.match(/\bto\s+([a-z][\w.-]{1,24})\b/i);
  if (toName) {
    const label = toName[1].trim();
    if (
      !/^(usdc|eurc|arc|base|eth|ethereum|arbitrum|polygon|solana|testnet|network|me)$/i.test(
        label,
      )
    ) {
      // Label only — never invent a burn address for live sends
      return {
        recipientLabel: label.charAt(0).toUpperCase() + label.slice(1),
        recipient: undefined,
      };
    }
  }

  const payName = text.match(/\bpay\s+([a-z][\w.-]{1,24})\b/i);
  if (payName) {
    const label = payName[1].trim();
    return {
      recipientLabel: label.charAt(0).toUpperCase() + label.slice(1),
      recipient: undefined,
    };
  }

  const atUser = text.match(/@([a-zA-Z0-9_]+)/);
  if (atUser) {
    return {
      recipientLabel: atUser[1],
      recipient: undefined,
    };
  }

  return {};
}

const CHAIN_WORD =
  "arc(?:\\s*testnet)?|base(?:\\s*sepolia)?|ethereum|eth(?:ereum)?(?:\\s*sepolia)?|arbitrum|arb|optimism|op|polygon|amoy|solana|sol|avalanche|avax|fuji";

function extractChains(text: string): {
  fromChain?: ReturnType<typeof resolveChain>;
  toChain?: ReturnType<typeof resolveChain>;
} {
  const t = text.replace(/\s+/g, " ").trim();

  // "from Arc to Base" / "from Base to Arc"
  const fromTo = t.match(
    new RegExp(
      `from\\s+(${CHAIN_WORD})\\s+to\\s+(${CHAIN_WORD})(?:\\s|$|,|\\.|and)`,
      "i",
    ),
  );
  if (fromTo) {
    return {
      fromChain: resolveChain(fromTo[1]),
      toChain: resolveChain(fromTo[2]),
    };
  }

  // "to Base from Arc"
  const toFrom = t.match(
    new RegExp(
      `(?:to|onto)\\s+(${CHAIN_WORD})\\s+from\\s+(${CHAIN_WORD})(?:\\s|$|,|\\.)`,
      "i",
    ),
  );
  if (toFrom) {
    return {
      toChain: resolveChain(toFrom[1]),
      fromChain: resolveChain(toFrom[2]),
    };
  }

  // "USDC Arc to Base" / "Arc to Base" / "Base → Arc" (most common agent phrasing)
  const arrow = t.match(
    new RegExp(
      `\\b(${CHAIN_WORD})\\s*(?:to|→|->|⇒)\\s*(${CHAIN_WORD})\\b`,
      "i",
    ),
  );
  if (arrow) {
    return {
      fromChain: resolveChain(arrow[1]),
      toChain: resolveChain(arrow[2]),
    };
  }

  // "bridge … to Base" only destination named
  const toOnly = t.match(
    new RegExp(`(?:to|onto)\\s+(${CHAIN_WORD})(?:\\s|$|,|\\.)`, "i"),
  );
  // "bridge … from Arc" only source named
  const fromOnly = t.match(
    new RegExp(`from\\s+(${CHAIN_WORD})(?:\\s|$|,|\\.)`, "i"),
  );

  return {
    toChain: resolveChain(toOnly?.[1]),
    fromChain: resolveChain(fromOnly?.[1]),
  };
}

function classify(text: string): { type: IntentType; confidence: number } {
  const t = text.toLowerCase().trim();

  // Greetings / small talk / help
  if (
    /^(hi|hello|hey|yo|gm|good (morning|afternoon|evening)|help|what can you do|how (do|does|to)|start)\b/.test(
      t,
    ) ||
    /^(how are you|how're you|how r u|how's it going|how is it going|what's up|whats up|sup|who are you|what are you)\b/i.test(
      t,
    ) ||
    t === "?"
  ) {
    return { type: "explain", confidence: 0.99 };
  }

  if (
    /(generate|scaffold|write|create).*(code|component|sdk|app kit|contract|solidity|next\.?js|api route)/i.test(
      t,
    ) ||
    /code for|example for|snippet|app kit bridge code/i.test(t)
  ) {
    return { type: "code", confidence: 0.92 };
  }
  if (/deploy.*(erc|contract|token|nft)|erc-?20|erc-?721/i.test(t)) {
    return { type: "deploy", confidence: 0.9 };
  }

  if (
    /balance|portfolio|holdings|how much|my funds|my usdc|wallet balance/i.test(
      t,
    ) ||
    /show my (balance|funds|money|usdc|portfolio)/i.test(t)
  ) {
    return { type: "balance", confidence: 0.95 };
  }

  // Risk / oracle
  if (
    /risk|assess route|route risk|oracle|safe to (send|bridge|transfer)/i.test(
      t,
    )
  ) {
    return { type: "explain", confidence: 0.9 }; // handled specially with risk tool in loop
  }

  if (
    (/bridge|move.*(to|onto)|transfer.*(across|cross)/i.test(t) &&
      /pay|send/.test(t)) ||
    /move\s+\$?[\d.]+.*pay/i.test(t) ||
    /and pay\s+\w+/i.test(t)
  ) {
    return { type: "route", confidence: 0.95 };
  }
  if (
    /\bbridge\b|move funds|move \$|cross-?chain transfer|cross-?chain bridge|transfer.*(base|eth|arc).*arc|transfer.*(arc).*(base|eth)|arc\s*(to|→|->)\s*base|base\s*(to|→|->)\s*arc|(?:move|send)\s+\$?[\d.]+\s*usdc\s+(?:from\s+)?(?:arc|base).*(?:to|→|->)\s*(?:arc|base)|(?:move|send)\s+\$?[\d.]+\s*usdc\s+to\s+(?:arc|base)\s+from\s+(?:arc|base)/i.test(
      t,
    )
  ) {
    return { type: "bridge", confidence: 0.93 };
  }
  if (/\bswap\b|convert|exchange|usdc\s*(to|→|->)\s*eurc|eurc\s*(to|→|->)\s*usdc/i.test(t)) {
    return { type: "swap", confidence: 0.93 };
  }
  if (
    /cheapest|fastest|payout route|optimize route|best route|routing/i.test(t)
  ) {
    return { type: "route", confidence: 0.9 };
  }
  if (
    /\bsend\b|\bpay\b|\bpayout\b|transfer \$|invoice|send\s+\d/i.test(t)
  ) {
    return { type: "send", confidence: 0.92 };
  }
  if (/agent|erc-?8004|erc-?8183|reputation|autonomous|payroll|job escrow/i.test(t)) {
    return { type: "agent", confidence: 0.88 };
  }
  if (/explain|what happened|failed|why|what is arc|how does/i.test(t)) {
    return { type: "explain", confidence: 0.85 };
  }

  // Soft send if amount + name-like pattern
  if (/\d/.test(t) && /\b(to|for)\s+[a-z]/i.test(t)) {
    return { type: "send", confidence: 0.7 };
  }

  return { type: "unknown", confidence: 0.4 };
}

export function parseIntent(raw: string): ParsedIntent {
  const { type, confidence } = classify(raw);
  const amount = extractAmount(raw);
  const { token, tokenOut } = extractTokensPair(raw);
  const { fromChain, toChain } = extractChains(raw);
  const { recipient, recipientLabel } = extractRecipient(raw);

  // Risk questions — keep as explain with flag in raw (agent loop detects)
  let codeTopic: string | undefined;
  if (type === "code" || type === "deploy") {
    if (/bridge/i.test(raw)) codeTopic = "bridge";
    else if (/swap/i.test(raw)) codeTopic = "swap";
    else if (/send|payment/i.test(raw)) codeTopic = "send";
    else if (/unified/i.test(raw)) codeTopic = "unified";
    else if (/next|component|react/i.test(raw)) codeTopic = "component";
    else if (/erc|solidity|contract|agent|x402|payroll|skills/i.test(raw))
      codeTopic = /agent|8004|8183/.test(raw)
        ? "agent"
        : /x402/.test(raw)
          ? "x402"
          : "contract";
    else codeTopic = "send";
  }

  let finalTo = toChain;
  let finalFrom = fromChain;

  // Bridge defaults: only fill the MISSING side — never overwrite Arc→Base with Base→Arc
  if (type === "bridge" || type === "route") {
    if (finalFrom && finalTo) {
      // both set — keep exactly as parsed
    } else if (!finalFrom && !finalTo) {
      // no chains named → classic Base → Arc
      finalFrom = "Base_Sepolia";
      finalTo = "Arc_Testnet";
    } else if (!finalFrom && finalTo === "Arc_Testnet") {
      finalFrom = "Base_Sepolia";
    } else if (!finalFrom && finalTo === "Base_Sepolia") {
      // "bridge to Base" with USDC on Arc → Arc → Base
      finalFrom = "Arc_Testnet";
    } else if (!finalTo && finalFrom === "Base_Sepolia") {
      finalTo = "Arc_Testnet";
    } else if (!finalTo && finalFrom === "Arc_Testnet") {
      // "bridge from Arc" → default destination Base
      finalTo = "Base_Sepolia";
    } else if (!finalFrom) {
      finalFrom = "Base_Sepolia";
    } else if (!finalTo) {
      finalTo = "Arc_Testnet";
    }
  }
  if (type === "send" && !finalTo) finalTo = "Arc_Testnet";
  if (type === "swap" && !finalTo) finalTo = "Arc_Testnet";

  // Default amount only for money intents
  const moneyTypes = new Set(["send", "swap", "bridge", "route"]);
  const defaultAmount = moneyTypes.has(type) ? amount ?? "10" : amount;

  return {
    type,
    confidence,
    amount: defaultAmount,
    token: token ?? "USDC",
    tokenOut: tokenOut ?? (type === "swap" ? "EURC" : undefined),
    fromChain: finalFrom,
    toChain: finalTo,
    recipient,
    recipientLabel,
    codeTopic,
    raw,
  };
}
