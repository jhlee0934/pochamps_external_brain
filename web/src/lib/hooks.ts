import { useCallback, useEffect, useState } from 'react';

export interface AsyncState<T> {
  data?: T;
  error?: Error;
  loading: boolean;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ data: s.data, loading: true }));
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (error: Error) => alive && setState({ error, loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// Browser storage can be missing or throw (private mode, blocked site data); the app
// then keeps working from memory.
function readStored<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : initial;
  } catch {
    return initial;
  }
}

export function useStoredState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() =>
    readStored(key, typeof initial === 'function' ? (initial as () => T)() : initial),
  );
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Runs async work over items with limited concurrency, reporting progress. */
export function useBatch() {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const run = useCallback(async <I, O>(items: I[], worker: (item: I) => Promise<O>, concurrency = 6) => {
    const out: O[] = new Array(items.length);
    let next = 0;
    let done = 0;
    setProgress({ done: 0, total: items.length });
    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (next < items.length) {
          const i = next++;
          out[i] = await worker(items[i]);
          setProgress({ done: ++done, total: items.length });
        }
      }),
    );
    setProgress(null);
    return out;
  }, []);
  return { run, progress };
}
