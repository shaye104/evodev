import {
  decodeSession,
  getCookie,
  setCookie,
  clearCookie,
  redirect,
} from './utils.js';
import { getUserById, getStaffByDiscordId, getStaffByUserId } from './db.js';

const SESSION_COOKIE = 'evo_session';

async function getSession(env, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return decodeSession(env.SESSION_SECRET, token);
}

async function getUserContext(env, request) {
  const session = await getSession(env, request);
  if (!session?.user_id) return { user: null, staff: null };
  const user = await getUserById(env, session.user_id);
  let staff = user ? await getStaffByUserId(env, user.id) : null;

  // Staff members created by an admin might not have user_id set yet.
  // Once the user logs in, link their staff record by discord_id.
  if (!staff && user?.discord_id) {
    staff = await getStaffByDiscordId(env, user.discord_id);
    if (staff?.id && !staff.user_id) {
      try {
        await env.DB.prepare('UPDATE staff_members SET user_id = ? WHERE id = ?')
          .bind(user.id, staff.id)
          .run();
        staff.user_id = user.id;
      } catch {
        // If linking fails, still return the staff row so permissions/nav work.
      }
    }
  }
  return { user, staff };
}

function requireAuth(user) {
  if (!user) return redirect('/login');
  return null;
}

function requireStaff(staff) {
  if (!staff) return new Response('Staff access required', { status: 403 });
  return null;
}

function requireAdmin(staff) {
  if (!staff || !staff.is_admin) {
    return new Response('Admin access required', { status: 403 });
  }
  return null;
}

function hasPermission(staff, permission) {
  if (!staff) return false;
  if (staff.is_admin) return true;
  if (!staff.permissions) return false;
  try {
    const perms = JSON.parse(staff.permissions);
    if (perms.includes('*')) return true;
    return perms.includes(permission);
  } catch {
    return false;
  }
}

function requirePermission(staff, permission) {
  if (hasPermission(staff, permission)) return null;
  return new Response('Permission denied', { status: 403 });
}

function buildSessionCookie(token) {
  return setCookie(SESSION_COOKIE, token, { maxAge: 60 * 60 * 24 * 7 });
}

function clearSessionCookie() {
  return clearCookie(SESSION_COOKIE);
}

export {
  getUserContext,
  requireAuth,
  requireStaff,
  requireAdmin,
  requirePermission,
  hasPermission,
  buildSessionCookie,
  clearSessionCookie,
};
