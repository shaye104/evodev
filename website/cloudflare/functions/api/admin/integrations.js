import { jsonResponse, nowIso } from '../../_lib/utils.js';
import { getUserContext } from '../../_lib/auth.js';
import { requireApiPermission, requireApiStaff } from '../../_lib/api.js';
import { ensureAppSettingsSchema } from '../../_lib/db.js';

const KEYS = ['PAYHIP_API_KEY', 'DISCORD_WEBHOOK_URL'];

export const onRequestGet = async ({ env, request }) => {
  const { staff } = await getUserContext(env, request);
  const guard =
    requireApiStaff(staff) ||
    (staff && staff.is_admin ? null : requireApiPermission(staff, 'admin.integrations'));
  if (guard) return guard;

  await ensureAppSettingsSchema(env);

  const placeholders = KEYS.map(() => '?').join(', ');
  const rows = await env.DB.prepare(
    `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (${placeholders})`
  )
    .bind(...KEYS)
    .all();

  const settings = {
    PAYHIP_API_KEY: '',
    DISCORD_WEBHOOK_URL: '',
  };
  for (const row of rows.results || []) {
    const key = String(row.setting_key || '').trim();
    if (!Object.prototype.hasOwnProperty.call(settings, key)) continue;
    settings[key] = row.setting_value == null ? '' : String(row.setting_value);
  }

  return jsonResponse({ settings });
};

export const onRequestPost = async ({ env, request }) => {
  const { user, staff } = await getUserContext(env, request);
  const guard =
    requireApiStaff(staff) ||
    (staff && staff.is_admin ? null : requireApiPermission(staff, 'admin.integrations'));
  if (guard) return guard;

  await ensureAppSettingsSchema(env);
  const body = await request.json().catch(() => ({}));
  const now = nowIso();

  for (const key of KEYS) {
    const value = String(body[key] || '').trim();
    if (!value) {
      await env.DB.prepare('DELETE FROM app_settings WHERE setting_key = ?')
        .bind(key)
        .run();
      continue;
    }
    await env.DB.prepare(
      `
      INSERT INTO app_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = excluded.updated_at
      `
    )
      .bind(key, value, now)
      .run();
  }

  await env.DB.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_discord_id, actor_type, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      user?.id || null,
      user?.discord_id || null,
      'admin',
      'integration.update',
      'settings',
      'payhip',
      JSON.stringify({
        payhip_api_key_set: Boolean(String(body.PAYHIP_API_KEY || '').trim()),
        discord_webhook_url_set: Boolean(
          String(body.DISCORD_WEBHOOK_URL || '').trim()
        ),
      }),
      now
    )
    .run();

  return jsonResponse({ ok: true });
};
