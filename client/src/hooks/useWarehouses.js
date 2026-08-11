import { useQuery } from '@tanstack/react-query';

import { warehousesApi } from '@/api/resources';

/**
 * Warehouses, plus whether the interface should bother showing a choice.
 *
 * A single-site operation gains nothing from picking "Entrepôt principal" on
 * every document, and a magasinier on a tablet loses a tap each time. When
 * exactly one active warehouse exists, `isSingle` is true and screens select it
 * automatically instead of rendering a one-option dropdown.
 *
 * This is a presentation decision only. The data model keeps warehouses and
 * transfers intact — the cahier des charges requires both (§2.1, §4.3), and a
 * second site later needs no migration, just a second row.
 */
export function useWarehouses({ includeInactive = false } = {}) {
  const query = useQuery({
    queryKey: ['warehouses', includeInactive ? 'all' : 'active'],
    queryFn: () => warehousesApi.list(includeInactive ? { includeInactive: '1' } : undefined),
    staleTime: 5 * 60 * 1000,
  });

  const warehouses = query.data?.items ?? [];
  const active = warehouses.filter((w) => w.isActive !== false);

  return {
    ...query,
    warehouses,
    isSingle: active.length === 1,
    /** The id to preselect, or '' when a real choice exists. */
    defaultId: active.length === 1 ? active[0].id : '',
    defaultWarehouse: active.length === 1 ? active[0] : null,
  };
}
