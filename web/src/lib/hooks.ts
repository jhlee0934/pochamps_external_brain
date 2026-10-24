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

const SHARED_EVENT = 'pochamps:shared-state';

/**
 * useStoredState whose value every component using the same key sees at once, e.g. the
 * Singles/Doubles choice shared by the meta page and every meta comparison.
 */
export function useSharedStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStored(key, initial));
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; value: T }>).detail;
      if (detail.key === key) setValue(detail.value);
    };
    window.addEventListener(SHARED_EVENT, onChange);
    return () => window.removeEventListener(SHARED_EVENT, onChange);
  }, [key]);
  const set = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      window.dispatchEvent(new CustomEvent(SHARED_EVENT, { detail: { key, value: next } }));
    },
    [key],
  );
  return [value, set] as const;
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
