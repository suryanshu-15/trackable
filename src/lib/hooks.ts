'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Paginated, type Query } from './api';
import type { Department, Factory, Location, Material, Supplier, TestDefinition, Unit, User } from './types';

/** GET an API path; the query key is the path + params, so screens share and invalidate by prefix. */
export function useApi<T>(path: string | null, query?: Query, options?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({
    queryKey: [path, query ?? {}],
    queryFn: ({ signal }) => api<T>(path as string, { query, signal }),
    enabled: path !== null,
    ...options,
  });
}

export function useMe() {
  return useQuery<User>({ queryKey: ['auth/me', {}], queryFn: () => api<User>('auth/me'), staleTime: 5 * 60_000 });
}

/** Master data changes rarely; load up to the API's page limit once and reuse it. */
function useMaster<T>(path: string, query: Query = {}) {
  const q = useQuery<Paginated<T>>({
    queryKey: [path, { page_size: 200, is_active: true, ...query }],
    queryFn: () => api<Paginated<T>>(path, { query: { page_size: 200, is_active: true, ...query } }),
    staleTime: 5 * 60_000,
  });
  return { ...q, items: q.data?.results ?? [] };
}

export const useSuppliers = () => useMaster<Supplier>('master/suppliers');
export const useMaterials = () => useMaster<Material>('master/materials');
export const useUnits = () => useMaster<Unit>('master/units');
export const useLocations = () => useMaster<Location>('master/locations');
export const useFactories = () => useMaster<Factory>('master/factories');
export const useDepartments = () => useMaster<Department>('master/departments');
export const useTestDefinitions = () => useMaster<TestDefinition>('master/test-definitions');
export const useWarehouses = () => useMaster<{ id: number; code: string; name: string }>('master/warehouses');

/**
 * Mutation that refreshes every query whose path starts with one of `invalidate` afterwards,
 * so screens always re-read persisted state rather than patching it locally.
 */
export function useAction<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>, invalidate: string[] = []) {
  const qc = useQueryClient();
  return useMutation<TResult, Error, TVars>({
    mutationFn: fn,
    onSuccess: () =>
      qc.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === 'string' && invalidate.some((p) => (q.queryKey[0] as string).startsWith(p)),
      }),
  });
}

/** Filter + page state for a paginated list; changing a filter returns to page 1. */
export function usePagedList<T>(path: string, initial: Record<string, string | string[]> = {}, pageSize = 25) {
  const [filters, setFilters] = useState<Record<string, string | string[]>>(initial);
  const [page, setPage] = useState(1);
  const query = useApi<Paginated<T>>(path, { ...filters, page, page_size: pageSize }, { placeholderData: keepPreviousData });
  const setFilter = (key: string, value: string | string[]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const replaceFilters = (next: Record<string, string | string[]>) => {
    setFilters(next);
    setPage(1);
  };
  return { ...query, filters, setFilter, replaceFilters, page, setPage, rows: query.data?.results ?? [] };
}

/**
 * After any successful write, re-read everything on screen from the server. Inventory screens
 * show interlinked state (a put-away changes the package, receipt and stock views at once), so
 * a blanket refetch is simpler and safer than patching individual caches.
 */
export function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export type Policy = {
  'receiving.line_acceptance': 'WHOLE' | 'PARTIAL';
  'package.unit_codes': string[];
  'package.type': string;
  'lab.sample_scope': 'SINGLE' | 'LOT' | 'PACKAGE';
  'lab.optional_failures_block_release': boolean;
  'issue.whole_packages_only': boolean;
  'issue.require_request': boolean;
  'issue.fifo_override_policy': 'ALLOW' | 'FORBID';
  'issue.override_roles': string[];
  'stock.near_expiry_days': number;
  'master.create_roles': Record<string, string[]>;
  'master.manage_roles': string[];
};

/** Business rules that shape forms (the API enforces them regardless). */
export function usePolicy() {
  return useQuery<Policy>({ queryKey: ['policy', {}], queryFn: () => api<Policy>('policy'), staleTime: 5 * 60_000 });
}
