import { scValToNative, xdr } from "@stellar/stellar-sdk";

export const METHOD_SIGNATURES: Record<string, string[]> = {
  // StreamRouter
  create_stream: ["sender", "recipient", "token", "rate_per_sec", "deposit"],
  withdraw: ["id"],
  withdraw_all: ["recipient"],
  top_up: ["id", "amount"],
  cancel: ["id"],
  withdrawable: ["id"],
  get_stream: ["id"],
  streams_by_sender: ["sender"],
  streams_by_recipient: ["recipient"],
  stream_count: [],

  // CascadeSplitter
  set_splits: ["owner", "splits"],
  get_splits: ["owner"],
  preview: ["owner", "amount"],
  distribute: ["from", "owner", "token", "amount"],
};

export interface FormatCliOptions {
  contractId: string;
  method: string;
  args?: xdr.ScVal[] | Record<string, unknown> | Array<unknown>;
  network?: string;
  source?: string;
}

/**
 * Format a value into a safe shell argument representation for Stellar CLI.
 */
export function formatCliValue(val: unknown): string {
  if (typeof val === "bigint" || typeof val === "number") {
    return val.toString();
  }
  if (typeof val === "string") {
    // If it contains spaces or quotes, wrap in quotes
    if (/[\s"']/.test(val)) {
      return `'${val.replace(/'/g, "'\\''")}'`;
    }
    return val;
  }
  if (typeof val === "boolean") {
    return val ? "true" : "false";
  }
  // Array or object (e.g. splits struct or JSON payload)
  const json = JSON.stringify(val);
  return `'${json.replace(/'/g, "'\\''")}'`;
}

/**
 * Generate the equivalent `stellar contract invoke` CLI command for a Soroban call.
 */
export function toStellarCliCommand({
  contractId,
  method,
  args = [],
  network,
  source,
}: FormatCliOptions): string {
  const parts: string[] = ["stellar", "contract", "invoke", "--id", contractId];

  if (source) {
    parts.push("--source", source);
  }
  if (network) {
    parts.push("--network", network);
  }

  parts.push("--", method);

  let namedArgs: Record<string, unknown> = {};

  if (Array.isArray(args)) {
    const signature = METHOD_SIGNATURES[method];
    args.forEach((arg, index) => {
      // Decode ScVal if applicable
      const nativeVal =
        arg instanceof xdr.ScVal ? scValToNative(arg as xdr.ScVal) : arg;
      const paramName = signature && signature[index] ? signature[index] : `arg${index + 1}`;
      namedArgs[paramName] = nativeVal;
    });
  } else if (args && typeof args === "object") {
    namedArgs = args as Record<string, unknown>;
  }

  for (const [key, val] of Object.entries(namedArgs)) {
    parts.push(`--${key}`, formatCliValue(val));
  }

  return parts.join(" ");
}
