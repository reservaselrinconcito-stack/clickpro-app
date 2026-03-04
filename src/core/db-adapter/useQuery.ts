/**
 * useQuery — adapter-agnostic reactive data hook
 *
 * Guards:
 *   1. Never executes queryFn before DB is ready (isDbReady guard)
 *   2. Re-executes when DB becomes ready (onDbReady callback)
 *   3. Re-executes when watched tables change (subscribeToTable)
 *   4. watchTables identity is stabilized to prevent re-subscribe on every render
 *
 * Usage:
 *   const invoices = useQuery(
 *     () => invoicesApi.all(),
 *     [],           // deps (reruns query when these change)
 *     ['invoices'], // tables to watch for mutations
 *   ) ?? [];
 */

import {
  useState, useEffect, useCallback, useRef,
  DependencyList,
} from 'react';
import { TableName, subscribeToTable } from './interface';
import { isDbReady, onDbReady } from '../db-state';

type QueryFn<T> = () => Promise<T>;

export function useQuery<T>(
  queryFn: QueryFn<T>,
  deps: DependencyList = [],
  watchTables?: TableName[],
): T | undefined {
  const [result, setResult] = useState<T | undefined>(undefined);
  const isMounted = useRef(true);
  // Stable string key for watchTables — avoids re-subscribing on every render
  // when caller passes an inline array literal like ['invoices']
  const tablesKey = watchTables ? watchTables.slice().sort().join(',') : '';

  const execute = useCallback(async () => {
    // ── DB ready guard ────────────────────────────────────────────────────
    // Do not fire any query before the adapter is fully initialized and
    // the database connection is verified. onDbReady() below handles the
    // deferred execution once the DB becomes ready.
    if (!isDbReady()) return;
    // ─────────────────────────────────────────────────────────────────────

    try {
      const data = await queryFn();
      if (isMounted.current) setResult(data);
    } catch (err) {
      console.error('[useQuery] query failed:', err);
      // Don't crash the component — leave result as previous value
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // ── Primary effect: run on mount and when deps change ─────────────────
  useEffect(() => {
    isMounted.current = true;
    let cleanup: (() => void) | undefined;

    if (isDbReady()) {
      execute();
    } else {
      // DB not ready yet — schedule execute for when it becomes ready
      cleanup = onDbReady(() => {
        if (isMounted.current) execute();
      });
    }

    return () => {
      isMounted.current = false;
      cleanup?.();
    };
  }, [execute]);

  // ── Table subscription effect: re-run query when watched tables mutate ─
  useEffect(() => {
    if (!tablesKey) return;

    const tables = tablesKey.split(',') as TableName[];
    const unsubs = tables.map(t => subscribeToTable(t, execute));
    return () => unsubs.forEach(fn => fn());

  // tablesKey is a stable string — only changes if the actual table list changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey, execute]);

  return result;
}

/**
 * Convenience wrapper — most common pattern in pages.
 * Tables to watch are the first argument, deps second.
 */
export function useQueryOnTable<T>(
  queryFn: QueryFn<T>,
  tables: TableName[],
  deps: DependencyList = [],
): T | undefined {
  return useQuery(queryFn, deps, tables);
}
