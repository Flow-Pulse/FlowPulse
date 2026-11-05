import {
  getAddress,
  getNetworkDetails,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { config } from "./config";

export async function freighterInstalled(): Promise<boolean> {
  try {
    const r = await isConnected();
    return !!r.isConnected;
  } catch {
    return false;
  }
}

export async function connectFreighter(): Promise<string> {
  if (!(await freighterInstalled())) {
    throw new Error("Freighter not detected. Install it from freighter.app and reload.");
  }
  const r = await requestAccess();
  if (r.error) throw new Error(String(r.error.message ?? r.error));
  if (!r.address) throw new Error("Freighter did not return an address");
  return r.address;
}

/** Returns the address if this site was previously authorized, without prompting. */
export async function restoreFreighter(): Promise<string | null> {
  try {
    if (!(await freighterInstalled())) return null;
    const r = await getAddress();
    return r.address || null;
  } catch {
    return null;
  }
}

export async function walletNetworkMismatch(): Promise<string | null> {
  try {
    const n = await getNetworkDetails();
    if (n.networkPassphrase && n.networkPassphrase !== config.networkPassphrase) {
      return n.network || "another network";
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function signWithFreighter(xdr: string, address: string): Promise<string> {
  const r = await signTransaction(xdr, { networkPassphrase: config.networkPassphrase, address });
  if (r.error) throw new Error(String(r.error.message ?? r.error));
  return r.signedTxXdr;
}

export async function fundWithFriendbot(address: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    const body = await res.text();
    if (/createAccountAlreadyExist|already funded/i.test(body)) return;
    throw new Error("Friendbot request failed");
  }
}

export async function xlmBalance(address: string): Promise<string | null> {
  try {
    const res = await fetch(`${config.horizonUrl}/accounts/${address}`);
    if (!res.ok) return null;
    const j = await res.json();
    const native = j.balances?.find((b: { asset_type: string }) => b.asset_type === "native");
    return native?.balance ?? "0";
  } catch {
    return null;
  }
}
