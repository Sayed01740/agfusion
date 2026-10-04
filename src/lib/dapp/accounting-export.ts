/**
 * Accounting and Financial Statement Export for AGFusion on Arc Network.
 * Exports transaction history into GAAP-compliant CSV format for corporate treasury.
 */
import type { TransactionRecord } from "@/types";

export function exportTreasuryStatementCsv(
  transactions: TransactionRecord[],
  filenamePrefix = "agfusion-arc-statement"
): void {
  if (!transactions.length) {
    alert("No transactions recorded to export.");
    return;
  }

  const headers = [
    "Date_UTC",
    "Transaction_ID",
    "Tx_Hash",
    "Type",
    "Token",
    "Amount",
    "Counterparty_or_Recipient",
    "Status",
    "Network",
    "Chain_ID",
    "Execution_Mode",
    "ArcScan_Explorer_URL",
  ];

  const rows = transactions.map((tx) => {
    const date = tx.createdAt ? new Date(tx.createdAt).toISOString() : new Date().toISOString();
    const token = tx.token || "USDC";
    const amount = tx.amount || "0";
    const counterparty = tx.recipient || "";
    const chainId = tx.toChain || tx.fromChain || "Arc_Testnet";
    const explorerUrl = tx.explorerUrl || (tx.txHash ? `https://testnet.arcscan.app/tx/${tx.txHash}` : "");

    return [
      `"${date}"`,
      `"${tx.id}"`,
      `"${tx.txHash || ""}"`,
      `"${tx.type}"`,
      `"${token}"`,
      `"${amount}"`,
      `"${counterparty}"`,
      `"${tx.status}"`,
      `"Arc Network"`,
      `"${chainId}"`,
      `"${tx.executionMode || "live"}"`,
      `"${explorerUrl}"`,
    ].join(",");
  });

  const csvContent = [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filenamePrefix}-${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseBatchCsv(csvText: string): Array<{
  address: string;
  amount: string;
  label?: string;
}> {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results: Array<{ address: string; amount: string; label?: string }> = [];

  for (const line of lines) {
    // Skip comment lines or header lines
    if (line.startsWith("#")) continue;
    const parts = line.split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
    if (parts.length < 2) continue;

    // Check if header line
    if (parts[0].toLowerCase().includes("address") || parts[1].toLowerCase().includes("amount")) {
      continue;
    }

    const address = parts[0];
    const amount = parts[1];
    const label = parts[2] || `Recipient ${results.length + 1}`;

    results.push({ address, amount, label });
  }

  return results;
}
