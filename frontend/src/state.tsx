import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { xdr } from "@stellar/stellar-sdk";
import { connectFreighter, restoreFreighter, walletNetworkMismatch } from "./lib/wallet";
import type { Receipt } from "./lib/receipts";
import type { Submitted } from "./lib/soroban";

export interface TxRequest {
  title: string;
  contractId: string;
  method: string;
  args: xdr.ScVal[];
  /** Human-readable args for the drawer and receipt. */
  display: Record<string, string>;
  /** Open in dry-run mode (simulate only, no signing). */
  dryRun?: boolean;
}

export interface TxOutcome extends Submitted {
  receipt: Receipt;
}

interface Pending {
  req: TxRequest;
  resolve: (r: TxOutcome | null) => void;
}

interface Ctx {
  address: string | null;
  connecting: boolean;
  walletError: string | null;
  networkWarning: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Opens the signing drawer; resolves with the outcome or null if dismissed. */
  runTx: (req: TxRequest) => Promise<TxOutcome | null>;
  pending: Pending | null;
  settle: (r: TxOutcome | null) => void;
  receipt: Receipt | null;
  openReceipt: (r: Receipt | null) => void;
  /** Bumped after every successful tx so pages can refetch. */
  version: number;
  toast: (msg: string, tone?: "ok" | "err") => void;
  toasts: { id: number; msg: string; tone: "ok" | "err" }[];
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Ctx["toasts"]>([]);
  const toastId = useRef(0);

  useEffect(() => {
    let off = false;
    try {
      if (localStorage.getItem("flowpulse.disconnected") === "1") return;
    } catch {
      /* ignore */
    }
    restoreFreighter().then(async (a) => {
      if (off || !a) return;
      setAddress(a);
      setNetworkWarning(await walletNetworkMismatch());
    });
    return () => {
      off = true;
    };
  }, []);

  const toast = useCallback((msg: string, tone: "ok" | "err" = "ok") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setWalletError(null);
    try {
      const a = await connectFreighter();
      setAddress(a);
      setNetworkWarning(await walletNetworkMismatch());
      try {
        localStorage.removeItem("flowpulse.disconnected");
      } catch {
        /* ignore */
      }
    } catch (e) {
      setWalletError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    try {
      localStorage.setItem("flowpulse.disconnected", "1");
    } catch {
      /* ignore */
    }
  }, []);

  const runTx = useCallback(
    (req: TxRequest) =>
      new Promise<TxOutcome | null>((resolve) => {
        setPending({ req, resolve });
      }),
    [],
  );

  const settle = useCallback(
    (r: TxOutcome | null) => {
      if (r) setVersion((v) => v + 1);
      pending?.resolve(r);
      setPending(null);
    },
    [pending],
  );

  return (
    <AppCtx.Provider
      value={{
        address,
        connecting,
        walletError,
        networkWarning,
        connect,
        disconnect,
        runTx,
        pending,
        settle,
        receipt,
        openReceipt: setReceipt,
        version,
        toast,
        toasts,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
