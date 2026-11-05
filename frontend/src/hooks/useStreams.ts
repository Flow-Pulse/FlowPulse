import { useEffect, useState } from "react";
import { router, type Stream } from "../lib/contracts";
import { useApp } from "../state";

export interface StreamsState {
  streams: Stream[];
  loading: boolean;
  error: string | null;
  /** "mine" when a wallet is connected, "public" shows recent network streams. */
  scope: "mine" | "public";
  total: bigint | null;
  reload: () => void;
}

const PUBLIC_LIMIT = 12;

export function useStreams(): StreamsState {
  const { address, version } = useApp();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<bigint | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let off = false;
    setLoading(true);
    setError(null);
    (async () => {
      const count = await router.count();
      if (off) return;
      setTotal(count);
      if (address) {
        const [out, inc] = await Promise.all([router.bySender(address), router.byRecipient(address)]);
        const map = new Map<string, Stream>();
        [...out, ...inc].forEach((s) => map.set(s.id.toString(), s));
        return [...map.values()].sort((a, b) => Number(b.id - a.id));
      }
      const ids: bigint[] = [];
      for (let i = count - 1n; i >= 0n && ids.length < PUBLIC_LIMIT; i--) ids.push(i);
      return Promise.all(ids.map((id) => router.get(id)));
    })()
      .then((list) => {
        if (!off && list) setStreams(list);
      })
      .catch((e) => !off && setError(String(e.message ?? e)))
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, [address, version, nonce]);

  return { streams, loading, error, scope: address ? "mine" : "public", total, reload: () => setNonce((n) => n + 1) };
}
