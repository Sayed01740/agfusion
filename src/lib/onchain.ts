/**
 * AGFusion on-chain identity (Arc Testnet).
 * Custom contract deployed by project owner — separate from Circle App Kit / CCTP.
 */

export const ARC_CHAIN_ID = 5042002;

/** Deployed AGFusionRegistry (Foundry Path A) */
export const AGFUSION_REGISTRY =
  process.env.NEXT_PUBLIC_AGFUSION_REGISTRY?.trim() ||
  "0x76BB5678eC11Ae94b34Ed9cF90B25C9Eea440483";

/** Deployer / owner wallet that broadcast the deploy tx */
export const AGFUSION_DEPLOYER =
  process.env.NEXT_PUBLIC_AGFUSION_DEPLOYER?.trim() ||
  "0xB00f41172c23d31571a3bE850AA0e81e58Ab8828";

export const AGFUSION_DEPLOY_TX =
  process.env.NEXT_PUBLIC_AGFUSION_DEPLOY_TX?.trim() ||
  "0x2db9e1244770254ac0a80bc2d2052fe504965272f6dd076465203b6c32bfab99";

export const AGFUSION_METADATA_URI =
  "https://agfusion.vercel.app/identity/agfusion-agent.json";

/** ERC-8004 IdentityRegistry (Arc Testnet) — see src/lib/erc8004.ts */
export const ERC8004_IDENTITY_REGISTRY =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e";

export function registryExplorerUrl(address = AGFUSION_REGISTRY): string {
  return `https://testnet.arcscan.app/address/${address}`;
}

export function txExplorerUrl(hash = AGFUSION_DEPLOY_TX): string {
  return `https://testnet.arcscan.app/tx/${hash}`;
}

export function walletExplorerUrl(address = AGFUSION_DEPLOYER): string {
  return `https://testnet.arcscan.app/address/${address}`;
}

/** Minimal ABI for UI / cast */
export const AGFUSION_REGISTRY_ABI = [
  {
    type: "function",
    name: "projectInfo",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "projectOwner", type: "address" },
      { name: "uri", type: "string" },
      { name: "isActive", type: "bool" },
      { name: "totalRegistrations", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "kind", type: "string" },
      { name: "uri", type: "string" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "registrationCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;
