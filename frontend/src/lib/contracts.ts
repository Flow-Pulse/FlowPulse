import { config } from "./config";
import { read, sv } from "./soroban";

export interface Stream {
  id: bigint;
  sender: string;
  recipient: string;
  token: string;
  rate_per_sec: bigint;
  deposit: bigint;
  withdrawn: bigint;
  start_time: bigint;
  checkpoint_amount: bigint;
  checkpoint_time: bigint;
  cancelled_at: bigint;
}

export interface Split {
  recipient: string;
  bps: number;
  label: string;
}

export interface Payout {
  recipient: string;
  amount: bigint;
  depth: number;
}

/** Mirror of the contract's `streamed_at` so tickers update every frame. */
export function streamedAt(s: Stream, nowSec: number): bigint {
  const end = s.cancelled_at !== 0n ? s.cancelled_at : BigInt(Math.floor(nowSec));
  const elapsed = end > s.checkpoint_time ? end - s.checkpoint_time : 0n;
  const accrued = s.checkpoint_amount + elapsed * s.rate_per_sec;
  return accrued > s.deposit ? s.deposit : accrued;
}

/** Sub-second precision version for smooth display (not used for amounts sent on-chain). */
export function streamedAtSmooth(s: Stream, nowMs: number): number {
  const end = s.cancelled_at !== 0n ? Number(s.cancelled_at) : nowMs / 1000;
  const elapsed = Math.max(0, end - Number(s.checkpoint_time));
  return Math.min(Number(s.deposit), Number(s.checkpoint_amount) + elapsed * Number(s.rate_per_sec));
}

export function withdrawableAt(s: Stream, nowSec: number): bigint {
  return streamedAt(s, nowSec) - s.withdrawn;
}

export type StreamStatus = "streaming" | "depleted" | "cancelled";

export function status(s: Stream, nowSec: number): StreamStatus {
  if (s.cancelled_at !== 0n) return "cancelled";
  return streamedAt(s, nowSec) >= s.deposit ? "depleted" : "streaming";
}

/** Seconds of runway left before the deposit is exhausted. */
export function runway(s: Stream, nowSec: number): number {
  if (s.cancelled_at !== 0n) return 0;
  const left = s.deposit - streamedAt(s, nowSec);
  return Number(left / s.rate_per_sec);
}

export const router = {
  id: config.streamRouterId,
  count: () => read<bigint>(config.streamRouterId, "stream_count"),
  get: (id: bigint) => read<Stream>(config.streamRouterId, "get_stream", [sv.u64(id)]),
  bySender: (a: string) => read<Stream[]>(config.streamRouterId, "streams_by_sender", [sv.addr(a)]),
  byRecipient: (a: string) =>
    read<Stream[]>(config.streamRouterId, "streams_by_recipient", [sv.addr(a)]),
};

export const splitter = {
  id: config.cascadeSplitterId,
  get: (owner: string) => read<Split[]>(config.cascadeSplitterId, "get_splits", [sv.addr(owner)]),
  preview: (owner: string, amount: bigint) =>
    read<Payout[]>(config.cascadeSplitterId, "preview", [sv.addr(owner), sv.i128(amount)]),
};
