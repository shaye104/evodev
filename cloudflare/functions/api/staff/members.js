import { jsonResponse } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiStaff, requireApiPermission } from '../../_lib/api.js';
import { ensureStaffNicknamesSchema } from '../../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard = requireApiStaff(staff) || requireApiPermission(staff, 'tickets.assign');
  if (guard) return guard;

  try {
    await ensureStaffNicknamesSchema(env);
  } catch {}

  const staffMembers = await env.DB.prepare(
    `
    SELECT sm.id, sm.discord_id, sm.user_id, sm.role_id, sm.is_active, sm.nickname,
      u.discord_username
    FROM staff_members sm
    LEFT JOIN users u ON sm.user_id = u.id
    WHERE sm.is_active = 1
    ORDER BY sm.created_at DESC, sm.id DESC
    `
  ).all();

  return jsonResponse({ staff: staffMembers.results || [] });
};
