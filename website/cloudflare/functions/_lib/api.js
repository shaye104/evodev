import { jsonResponse } from './utils.js';
import { hasPermission } from './auth.js';

function requireApiUser(user) {
  if (!user) return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

function requireApiStaff(staff) {
  if (!staff) return jsonResponse({ error: 'Staff access required' }, { status: 403 });
  return null;
}

function requireApiAdmin(staff) {
  if (!staff || !staff.is_admin) {
    return jsonResponse({ error: 'Admin access required' }, { status: 403 });
  }
  return null;
}

function requireApiPermission(staff, permission) {
  if (!hasPermission(staff, permission)) {
    return jsonResponse({ error: 'Permission denied' }, { status: 403 });
  }
  return null;
}

export {
  requireApiUser,
  requireApiStaff,
  requireApiAdmin,
  requireApiPermission,
};
