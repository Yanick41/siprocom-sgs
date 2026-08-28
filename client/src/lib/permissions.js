/**
 * Client-side permission map.
 *
 * This mirrors the server's `authorize(...)` guards for UI purposes only -
 * hiding a button the user cannot use. It is never a security boundary:
 * the server re-checks every request. See IMPLEMENTATION_PLAN.md §8.
 */

export const ROLES = {
  ADMIN: 'ADMIN',
  MAGASINIER: 'MAGASINIER',
  ACHATS: 'ACHATS',
  DIRECTION: 'DIRECTION',
};

const ALL = Object.values(ROLES);

export const PERMISSIONS = {
  // Reference data
  'products.view': ALL,
  'products.write': [ROLES.ADMIN, ROLES.MAGASINIER],
  'products.deactivate': [ROLES.ADMIN],
  'categories.view': ALL,
  'categories.write': [ROLES.ADMIN],
  'suppliers.view': ALL,
  'suppliers.write': [ROLES.ADMIN, ROLES.ACHATS],

  // Stock operations (Phase 3-4)
  'stock.view': ALL,
  'stock.write': [ROLES.ADMIN, ROLES.MAGASINIER],
  'stock.validate': [ROLES.ADMIN, ROLES.MAGASINIER],
  'stock.cancel': [ROLES.ADMIN],
  'stock.overrideNegative': [ROLES.ADMIN],

  // Alerts & reporting (Phase 5-6)
  'alerts.view': ALL,
  'alerts.acknowledge': [ROLES.ADMIN, ROLES.ACHATS],
  'reports.view': ALL,
  'reports.valuation': [ROLES.ADMIN, ROLES.DIRECTION],

  // Administration (Phase 7)
  'users.manage': [ROLES.ADMIN],
  'audit.view': [ROLES.ADMIN],
  'settings.manage': [ROLES.ADMIN],
};

/** can(user, 'products.write') */
export function can(user, permission) {
  if (!user?.role) return false;
  const allowed = PERMISSIONS[permission];
  if (!allowed) {
    if (import.meta.env.DEV) console.warn(`[permissions] Unknown permission "${permission}"`);
    return false;
  }
  return allowed.includes(user.role);
}
