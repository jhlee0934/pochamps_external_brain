import { useEffect, useRef, useState } from 'react';

/**
 * Runs `request` in a worker whenever it changes and returns the newest result.
 * Only the latest input matters: while a job runs, later requests replace each other and
 * the last one is sent when the worker frees up, so rapid input never builds a backlog.
 */
export function useWorkerJob<Req extends object, Res>(
  createWorker: () => Worker,
  request: Req | null,
): { output: Res | undefined; outputFor: Req | undefined; pending: boolean } {
  const [state, setState] = useState<{ output?: Res; outputFor?: Req }>({});
  const [pending, setPending] = useState(false);
  const worker = useRef<Worker | null>(null);
  const busy = useRef(false);
  const queued = useRef<{ id: number; request: Req } | null>(null);
  const nextId = useRef(0);
  const latestId = useRef(0);
  const sent = useRef(new Map<number, Req>());

  useEffect(() => {
    const w = createWorker();
    w.onmessage = (e: MessageEvent<{ id: number; result: Res }>) => {
      const req = sent.current.get(e.data.id);
      sent.current.delete(e.data.id);
      if (e.data.id === latestId.current) setState({ output: e.data.result, outputFor: req });
      if (queued.current) {
        sent.current.set(queued.current.id, queued.current.request);
        w.postMessage({ id: queued.current.id, ...queued.current.request });
        queued.current = null;
      } else {
        busy.current = false;
        setPending(false);
      }
    };
    worker.current = w;
    return () => w.terminate();
    // The worker lives as long as the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!request || !worker.current) return;
    const id = ++nextId.current;
    latestId.current = id;
    setPending(true);
    if (busy.current) queued.current = { id, request };
    else {
      busy.current = true;
      sent.current.set(id, request);
      worker.current.postMessage({ id, ...request });
    }
  }, [request]);

  return { output: state.output, outputFor: state.outputFor, pending };
}
