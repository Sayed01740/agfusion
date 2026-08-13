// @ts-nocheck
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { createKernelAccountClient } from "@zerodev/sdk";
// Note: We use viem and zerodev/permissions to manage the local session key.

const SESSION_KEY_STORAGE_KEY = "agfusion_agent_session_key";

/**
 * Gets or creates the Agent's local private key.
 * This key is held in the browser's local storage and used by the AI agent to sign transactions.
 */
export function getOrCreateAgentLocalKey(): `0x${string}` {
  if (typeof window === "undefined") return "0x" as `0x${string}`;
  
  let key = localStorage.getItem(SESSION_KEY_STORAGE_KEY) as `0x${string}` | null;
  if (!key) {
    key = generatePrivateKey();
    localStorage.setItem(SESSION_KEY_STORAGE_KEY, key);
  }
  return key;
}

/**
 * Creates an ECDSA Signer for the ZeroDev session key using the local private key.
 */
export async function getAgentSessionSigner(publicClient: any) {
  const localPrivateKey = getOrCreateAgentLocalKey();
  const account = privateKeyToAccount(localPrivateKey);
  
  const sessionKeySigner = await signerToEcdsaValidator(publicClient, {
    signer: account,
  });
  
  return sessionKeySigner;
}

/**
 * Saves the approved session key account state to local storage so the agent can use it across reloads.
 */
export async function saveSessionAccount(kernelAccount: any) {
  if (typeof window === "undefined") return;
  // TODO: Implement session account serialization when needed
}

/**
 * Loads the approved session key account state from local storage.
 */
export async function loadSessionAccount(publicClient: any, sessionKeySigner: any) {
  if (typeof window === "undefined") return null;
  // TODO: Implement session account deserialization when needed
  return null;
}

/**
 * Clears the session key, usually when disconnecting or changing wallets.
 */
export function clearSessionKey() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SERIALIZED_SESSION_ACCOUNT_KEY);
    // We can keep the local private key, or remove it as well. 
    // Usually safe to keep it, but removing it ensures a completely fresh state.
    localStorage.removeItem(SESSION_KEY_STORAGE_KEY);
  }
}
