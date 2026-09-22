/**
 * Permission system — maps routes to feature keys and provides access checks.
 *
 * Feature keys match what is stored in User.permissions JSON:
 *   { dashboard: true, devices: true, interfaces: false, ... }
 *
 * ADMIN role always has full access regardless of permissions object.
 */

// Map route path prefixes → permission key
export const ROUTE_PERMISSION_MAP = {
  '/':            'dashboard',
  '/devices':     'devices',
  '/interfaces':  'interfaces',
  '/topology':    'topology',
  '/traffic':     'traffic',
  '/wireless':    'wireless',
  '/internet':    'internet',
  '/alerts':      'alerts',
  '/vlans':       'vlans',
  '/ipam':        'ipam',
  '/ftth':        'ftth_map',
  '/odc':         'odc',
  '/odp':         'odp',
  '/customers':   'customers',
  '/settings':    'settings',
  '/users':       'user_mgmt',
}

// Sidebar nav items also need permission keys
export const NAV_PERMISSION_MAP = {
  '/':            'dashboard',
  '/devices':     'devices',
  '/interfaces':  'interfaces',
  '/topology':    'topology',
  '/traffic':     'traffic',
  '/wireless':    'wireless',
  '/internet':    'internet',
  '/alerts':      'alerts',
  '/vlans':       'vlans',
  '/ipam':        'ipam',
  '/ftth':        'ftth_map',
  '/odc':         'odc',
  '/odp':         'odp',
  '/customers':   'customers',
  '/settings':    'settings',
  '/users':       'user_mgmt',
}

/**
 * Check if a user has permission for a given feature key.
 * ADMIN always returns true.
 * If permissions object is null/undefined, defaults to all-allowed.
 */
export function hasFeatureAccess(user, featureKey) {
  if (!user) return false
  if (user.role === 'ADMIN') return true
  if (!featureKey) return true

  const perms = user.permissions
  // If no permissions set yet → allow all (backward compat)
  if (!perms || typeof perms !== 'object') return true

  return !!perms[featureKey]
}

/**
 * Given a pathname, resolve the permission key and check access.
 */
export function hasRouteAccess(user, pathname) {
  if (!user) return false
  if (user.role === 'ADMIN') return true

  // Find the best matching route prefix
  const key = getPermissionKeyForPath(pathname)
  if (!key) return true // No permission key mapped → allow

  return hasFeatureAccess(user, key)
}

/**
 * Get the permission key for a given path.
 */
export function getPermissionKeyForPath(pathname) {
  // Exact match first
  if (ROUTE_PERMISSION_MAP[pathname]) return ROUTE_PERMISSION_MAP[pathname]

  // Prefix match (e.g. /devices/abc → 'devices', /odc/new → 'odc')
  const sorted = Object.keys(ROUTE_PERMISSION_MAP)
    .filter(p => p !== '/')
    .sort((a, b) => b.length - a.length) // longest first

  for (const prefix of sorted) {
    if (pathname.startsWith(prefix)) return ROUTE_PERMISSION_MAP[prefix]
  }

  // Root path check
  if (pathname === '/') return ROUTE_PERMISSION_MAP['/']

  return null
}
