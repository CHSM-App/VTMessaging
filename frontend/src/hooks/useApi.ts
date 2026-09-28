import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api/client';
import { getSocket } from '../services/socket/socket';

/** GET a path; re-fetches when the path changes. `reload` refreshes in place. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const current = useRef(path);
  current.current = path;

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const d = await api.get<T>(path);
      if (current.current === path) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (current.current === path) setError((e as Error).message);
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Subscribes to a realtime event for the lifetime of the component. */
export function useSocketEvent<T>(event: string, handler: (data: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const socket = getSocket();
    const fn = (d: T) => ref.current(d);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [event]);
}
