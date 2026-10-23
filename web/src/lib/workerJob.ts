import { useEffect, useRef, useState } from 'react';

/**
 * Runs `request` in a worker whenever it changes and returns the newest result.
 * Only the latest input matters: while a job runs, later requests replace each other and
 * the last one is sent when the worker frees up, so rapid input never builds a backlog.
 * A crashed worker is replaced and the latest request retried once; a second crash on the
 * same request is reported through `error` instead of leaving `pending` stuck.
 */
export function useWorkerJob<Req extends object, Res>(
  createWorker: () => Worker,
  request: Req | null,
): { output: Res | undefined; outputFor: Req | undefined; pending: boolean; error: string | undefined } {
  const [state, setState] = useState<{ output?: Res; outputFor?: Req }>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const worker = useRef<Worker | null>(null);
  // The job the worker is running, and the newest request waiting behind it.
  const running = useRef<{ id: number; request: Req } | null>(null);
  const queued = useRef<{ id: number; request: Req } | null>(null);
  const nextId = useRef(0);
  const latestId = useRef(0);
  const retried = useRef(-1);

  const send = (job: { id: number; request: Req }) => {
    running.current = job;
    worker.current?.postMessage({ id: job.id, ...job.request });
  };

  const sendNext = () => {
    const next = queued.current;
    queued.current = null;
    if (next) send(next);
    else {
      running.current = null;
      setPending(false);
    }
  };

  const spawn = () => {
    const w = createWorker();
    w.onmessage = (e: MessageEvent<{ id: number; result: Res }>) => {
      const job = running.current;
      if (job && e.data.id === latestId.current) {
        setState({ output: e.data.result, outputFor: job.request });
        setError(undefined);
      }
      sendNext();
    };
    const crash = (message: string) => {
      const job = running.current;
      w.terminate();
      worker.current = spawn();
      // Retry the newest request once on a fresh worker; give up if that crashes too.
      const retry = queued.current ?? job;
      queued.current = null;
      if (retry && retried.current !== retry.id) {
        retried.current = retry.id;
        send(retry);
      } else {
        running.current = null;
        setPending(false);
        setError(message);
      }
    };
    w.onerror = (e) => {
      e.preventDefault();
      crash(e.message || '계산 워커 오류');
    };
    w.onmessageerror = () => crash('계산 결과를 받지 못했습니다');
    return w;
  };

  useEffect(() => {
    worker.current = spawn();
    // Remounting (StrictMode, fast refresh) starts clean and resends whatever was in flight.
    const resend = queued.current ?? running.current;
    running.current = null;
    queued.current = null;
    if (resend) send(resend);
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
    // The worker lives as long as the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!request) return;
    const job = { id: ++nextId.current, request };
    latestId.current = job.id;
    setPending(true);
    if (running.current || !worker.current) queued.current = job;
    else send(job);
  }, [request]);

  return { output: state.output, outputFor: state.outputFor, pending, error };
}
