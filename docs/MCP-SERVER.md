# AGFusion MCP Server — Arc Network AI Integration

The **AGFusion MCP Server** implements the open [Model Context Protocol (MCP)](https://modelcontextprotocol.io) to allow AI coding assistants and autonomous agents (such as Claude Desktop, Cursor, Antigravity, and custom LLM loops) to interact directly with **Arc Network** (Chain ID: `5042002`).

---

## Capabilities / Tools Exposed

| Tool Name | What it does |
|-----------|--------------|
| `arc_get_network_info` | Returns Arc Network parameters, RPC, native USDC gas config, contract addresses, and ArcScan links. |
| `arc_get_balance` | Fetches live native USDC balance for any EVM address on Arc Testnet. |
| `arc_estimate_gas_savings` | Computes live gas cost in USDC and compares savings against Ethereum L1 (typically >99.9% savings). |
| `arc_prepare_batch_disperse` | Generates execution plan for `AGFusionDisperse` (single-signature batch token sends). |
| `arc_escrow_query` | Queries status of on-chain AI Agent milestone escrows in `AGFusionEscrow`. |

---

## Configuration

### 1. Claude Desktop

Add this block to your `claude_desktop_config.json`:

* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agfusion-arc": {
      "command": "node",
      "args": ["C:/Users/sayed/.grok/bin/agfusion/mcp/server.mjs"]
    }
  }
}
```

### 2. Cursor / Antigravity IDE

In Cursor Settings → Features → MCP:
- Name: `agfusion-arc`
- Type: `command`
- Command: `node C:/Users/sayed/.grok/bin/agfusion/mcp/server.mjs`

---

## Example Agent Prompts

Once connected, your AI assistant can answer and execute tasks like:
- *"Check the balance of 0x76bb5678ec11ae94b34ed9cf90b25c9eea440483 on Arc Testnet."*
- *"Estimate how much USDC gas I will save by batching 10 payroll transfers on Arc instead of Ethereum L1."*
- *"Prepare a batch disperse payload to pay 3 contractor addresses 10 USDC each."*
