import { useEffect } from 'react';

import { useWarehouses } from '@/hooks/useWarehouses';

/**
 * Warehouse picker that disappears when there is nothing to pick.
 *
 * With one warehouse it renders its name as static text and selects it for the
 * caller, so single-site users never choose between one option. With several it
 * is an ordinary select. Screens therefore need no branching of their own.
 */
export default function WarehouseSelect({
  id,
  label,
  value,
  onChange,
  placeholder = '—',
  exclude,
  required = false,
  className = '',
}) {
  const { warehouses, isSingle, defaultId, defaultWarehouse } = useWarehouses();

  // Selecting on the caller's behalf must happen in an effect: doing it during
  // render would update a parent mid-render.
  useEffect(() => {
    if (isSingle && !value && !exclude) onChange(defaultId);
  }, [isSingle, value, defaultId, exclude, onChange]);

  if (isSingle && !exclude) {
    return (
      <div className={className}>
        <span className="label">{label}</span>
        <p className="flex min-h-11 items-center rounded-lg bg-slate-50 px-3 text-sm text-slate-700">
          {defaultWarehouse?.name}
        </p>
      </div>
    );
  }

  const options = warehouses.filter((w) => w.isActive !== false && w.id !== exclude);

  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {required && (
          <span className="ml-0.5 text-sgs-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="input">
        <option value="">{placeholder}</option>
        {options.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name}
          </option>
        ))}
      </select>
    </div>
  );
}
