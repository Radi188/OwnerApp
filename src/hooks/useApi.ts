import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { errMsg } from '../utils/format';

type Options = {
  /** Re-fetch every time the screen regains focus (after returning from a form). */
  refetchOnFocus?: boolean;
  enabled?: boolean;
};

/**
 * Minimal data-fetching hook: loading / refreshing / error state, pull-to-refresh
 * and optional refetch when the screen comes back into focus.
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
  { refetchOnFocus = true, enabled = true }: Options = {},
) {
  const [data, setData]             = useState<T | null>(null);
  const [loading, setLoading]       = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const firstFocus = useRef(true);
  const fetchRef   = useRef(fetcher);
  fetchRef.current = fetcher;

  const run = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (!enabled) return;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    try {
      const res = await fetchRef.current();
      setData(res);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    run('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) { firstFocus.current = false; return; }
      if (refetchOnFocus) run('silent');
    }, [refetchOnFocus, run]),
  );

  return {
    data,
    setData,
    loading,
    refreshing,
    error,
    refresh: () => run('refresh'),
    reload:  () => run('silent'),
  };
}
