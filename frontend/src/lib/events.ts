import { scValToNative, xdr } from "@stellar/stellar-sdk";
import { config } from "./config";
import { server, withRetry } from "./soroban";
import type { Receipt } from "./receipts";

export interface DecodedPayoutEvent {
  id: string;
  txHash: string;
  contractId: string;
  ledger: number;
  ledgerClosedAt: string;
  topicName: "created" | "withdrawn" | "topped_up" | "cancelled" | "splits_set" | "distributed" | "unknown";
  functionLabel: string;
  account: string;
  counterparty?: string;
  amount?: string;
  source: "rpc" | "receipt";
  streamId?: number;
}

export interface LedgerItem {
  key: string;
  txHash: string;
  title: string;
  functionName: string;
  timestamp: number;
  formattedTime: string;
  amount?: string;
  account: string;
  counterparty?: string;
  source: "rpc" | "receipt";
  receipt?: Receipt;
}

/**
 * Safely decodes an individual Soroban event topic from ScVal or base64 XDR string.
 */
export function decodeTopicVal(raw: unknown): unknown {
  if (!raw) return null;
  try {
    if (typeof raw === "string") {
      const val = xdr.ScVal.fromXDR(raw, "base64");
      return scValToNative(val);
    }
    return scValToNative(raw as xdr.ScVal);
  } catch {
    return raw;
  }
}

/**
 * Safely decodes an individual Soroban event value from ScVal or base64 XDR string.
 */
export function decodeValueVal(raw: unknown): unknown {
  if (!raw) return null;
  try {
    if (typeof raw === "string") {
      const val = xdr.ScVal.fromXDR(raw, "base64");
      return scValToNative(val);
    }
    return scValToNative(raw as xdr.ScVal);
  } catch {
    return raw;
  }
}

/**
 * Pure decoder: translates raw RPC contract event response into a typed DecodedPayoutEvent.
 */
export function decodeContractEvent(ev: {
  id: string;
  contractId: string;
  txHash?: string;
  ledger?: number;
  ledgerClosedAt?: string;
  topic: unknown[];
  value: unknown;
}): DecodedPayoutEvent | null {
  try {
    if (!ev || !Array.isArray(ev.topic) || ev.topic.length === 0) return null;

    const topicZero = String(decodeTopicVal(ev.topic[0]) ?? "").toLowerCase();
    const dataVal = decodeValueVal(ev.value) as Record<string, unknown> | null;

    let topicName: DecodedPayoutEvent["topicName"] = "unknown";
    let functionLabel = "Contract Event";
    let account = "";
    let counterparty: string | undefined;
    let amount: string | undefined;
    let streamId: number | undefined;

    if (topicZero === "withdrawn" || topicZero === "withdraw") {
      topicName = "withdrawn";
      functionLabel = "Stream Withdrawal";
      if (ev.topic.length > 1) streamId = Number(decodeTopicVal(ev.topic[1]));
      if (ev.topic.length > 2) account = String(decodeTopicVal(ev.topic[2]) ?? "");
      if (dataVal && "amount" in dataVal) {
        amount = String(dataVal.amount);
      } else if (typeof dataVal === "bigint" || typeof dataVal === "number") {
        amount = String(dataVal);
      }
    } else if (topicZero === "created" || topicZero === "create_stream") {
      topicName = "created";
      functionLabel = "Opened micro-stream";
      if (ev.topic.length > 1) streamId = Number(decodeTopicVal(ev.topic[1]));
      if (ev.topic.length > 2) account = String(decodeTopicVal(ev.topic[2]) ?? ""); // sender
      if (ev.topic.length > 3) counterparty = String(decodeTopicVal(ev.topic[3]) ?? ""); // recipient
      if (dataVal && "deposit" in dataVal) amount = String(dataVal.deposit);
    } else if (topicZero === "topped_up" || topicZero === "top_up") {
      topicName = "topped_up";
      functionLabel = "Stream top-up";
      if (ev.topic.length > 1) streamId = Number(decodeTopicVal(ev.topic[1]));
      if (dataVal && "amount" in dataVal) amount = String(dataVal.amount);
    } else if (topicZero === "cancelled" || topicZero === "cancel") {
      topicName = "cancelled";
      functionLabel = "Stream cancelled";
      if (ev.topic.length > 1) streamId = Number(decodeTopicVal(ev.topic[1]));
      if (dataVal && "paid_to_recipient" in dataVal) amount = String(dataVal.paid_to_recipient);
    } else if (topicZero === "distributed" || topicZero === "distribute") {
      topicName = "distributed";
      functionLabel = "Cascade distribution";
      if (ev.topic.length > 1) account = String(decodeTopicVal(ev.topic[1]) ?? ""); // owner
      if (ev.topic.length > 2) counterparty = String(decodeTopicVal(ev.topic[2]) ?? ""); // from
      if (dataVal && "amount" in dataVal) amount = String(dataVal.amount);
    } else if (topicZero === "splits_set" || topicZero === "set_splits") {
      topicName = "splits_set";
      functionLabel = "Published split table";
      if (ev.topic.length > 1) account = String(decodeTopicVal(ev.topic[1]) ?? "");
    } else {
      return null;
    }

    return {
      id: ev.id,
      txHash: ev.txHash ?? "",
      contractId: String(ev.contractId),
      ledger: ev.ledger ?? 0,
      ledgerClosedAt: ev.ledgerClosedAt ?? new Date().toISOString(),
      topicName,
      functionLabel,
      account,
      counterparty,
      amount,
      source: "rpc",
      streamId,
    };
  } catch {
    return null;
  }
}

/**
 * Queries getEvents from Soroban RPC for the StreamRouter and CascadeSplitter contracts.
 * Falls back gracefully to empty array on network errors or RPC retention pruning.
 */
export async function fetchContractEvents(
  targetAddress: string,
  lookbackLedgers = 10000
): Promise<DecodedPayoutEvent[]> {
  try {
    const latest = await withRetry(() => server.getLatestLedger());
    const startLedger = Math.max(1, latest.sequence - lookbackLedgers);

    const contractIds = [config.streamRouterId, config.cascadeSplitterId].filter(Boolean);
    if (contractIds.length === 0) return [];

    const response = await withRetry(() =>
      server.getEvents({
        startLedger,
        filters: [
          {
            type: "contract",
            contractIds,
          },
        ],
      })
    );

    const events: DecodedPayoutEvent[] = [];

    for (const raw of response.events) {
      const decoded = decodeContractEvent({
        id: raw.id,
        contractId: raw.contractId ? String(raw.contractId) : "",
        txHash: raw.txHash,
        ledger: raw.ledger,
        ledgerClosedAt: raw.ledgerClosedAt,
        topic: raw.topic as unknown[],
        value: raw.value as unknown,
      });

      if (decoded) {
        // Filter by connected address (as sender, recipient, owner, or counterparty)
        const matchesAddress =
          !targetAddress ||
          decoded.account === targetAddress ||
          decoded.counterparty === targetAddress;

        if (matchesAddress) {
          events.push(decoded);
        }
      }
    }

    return events;
  } catch {
    // Graceful fallback when RPC is unreachable or queries beyond retention window
    return [];
  }
}

/**
 * Merges RPC-discovered events with locally cached receipts.
 * De-duplicates by transaction hash, prioritizing RPC verified items.
 */
export function mergeEventsWithReceipts(
  rpcEvents: DecodedPayoutEvent[],
  localReceipts: Receipt[]
): LedgerItem[] {
  const map = new Map<string, LedgerItem>();

  // Add RPC events first
  for (const ev of rpcEvents) {
    const timeMs = Date.parse(ev.ledgerClosedAt) || Date.now();
    const key = ev.txHash || ev.id;
    map.set(key, {
      key,
      txHash: ev.txHash,
      title: ev.functionLabel,
      functionName: ev.topicName,
      timestamp: timeMs,
      formattedTime: ev.ledgerClosedAt,
      amount: ev.amount,
      account: ev.account,
      counterparty: ev.counterparty,
      source: "rpc",
    });
  }

  // Merge local receipts (filling gaps or attaching receipt objects for audit inspection)
  for (const r of localReceipts) {
    const txHash = r.receipt.tx_hash;
    const timeMs = Date.parse(r.receipt.ledger_close_time) || Date.now();
    const existing = map.get(txHash);

    if (existing) {
      existing.receipt = r;
    } else {
      map.set(txHash, {
        key: txHash,
        txHash,
        title: r.receipt.function,
        functionName: r.receipt.function,
        timestamp: timeMs,
        formattedTime: r.receipt.ledger_close_time,
        account: r.receipt.source ?? "",
        source: "receipt",
        receipt: r,
      });
    }
  }

  // Sort descending by timestamp
  return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
}
