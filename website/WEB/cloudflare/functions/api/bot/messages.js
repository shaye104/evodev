import { jsonResponse } from '../../_lib/utils.js';
import { requireBotAuth } from '../../_lib/bot.js';
import { ensureTicketReadsSchema, ensureTicketNotificationStateSchema } from '../../_lib/db.js';

export const onRequestGet = async ({ env, request }) => {
  const guard = requireBotAuth(env, request);
  if (guard) return guard;

  await ensureTicketReadsSchema(env);
  await ensureTicketNotificationStateSchema(env);

  const url = new URL(request.url);
  const sinceId = Number(url.searchParams.get('since_id') || 0) || 0;
  const nowMs = Date.now();
  const cooldownMs = 30 * 60 * 1000;

  const results = await env.DB.prepare(
    `
    SELECT
      tm.*,
      t.id AS ticket_row_id,
      t.public_id,
      t.creator_discord_id,
      t.creator_user_id,
      COALESCE(sm.nickname, su.discord_username, su.email, 'Staff') AS author_name
    FROM ticket_messages tm
    JOIN tickets t ON tm.ticket_id = t.id
    LEFT JOIN users u ON t.creator_user_id = u.id
    LEFT JOIN staff_members sm ON sm.user_id = tm.author_user_id
    LEFT JOIN users su ON su.id = tm.author_user_id
    WHERE tm.author_type = 'staff'
      AND tm.id > ?
      AND (
        t.source = 'discord'
        OR (t.source = 'web' AND u.notifications_enabled = 1)
      )
    ORDER BY tm.id ASC
    LIMIT 200
    `
  )
    .bind(sinceId)
    .all();

  const messages = results.results || [];
  if (!messages.length) {
    return jsonResponse({ messages: [], attachments: [] });
  }

  // Gather read state for web users and notification state for dedupe.
  const ticketIds = Array.from(new Set(messages.map((m) => m.ticket_id).filter(Boolean)));
  const ticketIdPlaceholders = ticketIds.map(() => '?').join(',');

  const userIds = Array.from(
    new Set(
      messages
        .map((m) => Number(m.creator_user_id || 0) || 0)
        .filter((id) => id > 0)
    )
  );
  const userIdPlaceholders = userIds.map(() => '?').join(',');

  const readsMap = new Map();
  if (ticketIds.length && userIds.length) {
    const reads = await env.DB.prepare(
      `
      SELECT ticket_id, reader_id, last_read_message_id
      FROM ticket_reads
      WHERE reader_type = 'user'
        AND ticket_id IN (${ticketIdPlaceholders})
        AND reader_id IN (${userIdPlaceholders})
      `
    )
      .bind(...ticketIds, ...userIds)
      .all();
    for (const r of reads.results || []) {
      readsMap.set(`${r.ticket_id}:${r.reader_id}`, Number(r.last_read_message_id || 0) || 0);
    }
  }

  const notifMap = new Map();
  if (ticketIds.length) {
    const states = await env.DB.prepare(
      `
      SELECT ticket_id, recipient_discord_id, recipient_user_id, last_notified_at, last_notified_message_id
      FROM ticket_notification_state
      WHERE ticket_id IN (${ticketIdPlaceholders})
      `
    )
      .bind(...ticketIds)
      .all();
    for (const s of states.results || []) {
      notifMap.set(`${s.ticket_id}:${s.recipient_discord_id}`, {
        last_notified_at: s.last_notified_at || null,
        last_notified_message_id: Number(s.last_notified_message_id || 0) || 0,
        recipient_user_id: Number(s.recipient_user_id || 0) || null,
      });
    }
  }

  // Decide whether each message should trigger a DM notification.
  // We still return all messages so the bot can advance since_id, but we add notify=false to suppress spamming.
  const toUpsert = [];
  for (const msg of messages) {
    msg.notify = true;
    if (!msg.creator_discord_id) {
      msg.notify = false;
      continue;
    }

    // Never notify the ticket opener about their own message.
    // This can happen if a staff member opens a ticket and then replies (author_type='staff'),
    // or if a Discord-sourced ticket is replied to by the same Discord account.
    const sameUserId =
      msg.creator_user_id &&
      msg.author_user_id &&
      Number(msg.creator_user_id) === Number(msg.author_user_id);
    const sameDiscordId =
      msg.creator_discord_id &&
      msg.author_discord_id &&
      String(msg.creator_discord_id) === String(msg.author_discord_id);
    if (sameUserId || sameDiscordId) {
      msg.notify = false;
      continue;
    }

    const key = `${msg.ticket_id}:${msg.creator_discord_id}`;
    const state = notifMap.get(key);
    if (state) {
      const lastNotifiedAtMs = state.last_notified_at ? Date.parse(state.last_notified_at) : 0;
      const withinCooldown = lastNotifiedAtMs && nowMs - lastNotifiedAtMs < cooldownMs;

      // If we can determine unread state (web user), only suppress if it's still unread.
      const creatorUserId = Number(msg.creator_user_id || 0) || 0;
      const readId = creatorUserId ? readsMap.get(`${msg.ticket_id}:${creatorUserId}`) || 0 : null;
      const hasUnread = readId == null ? true : readId < (state.last_notified_message_id || 0);

      if (withinCooldown && hasUnread) {
        msg.notify = false;
      }
    }

    if (msg.notify) {
      const nowIso = new Date().toISOString();
      notifMap.set(key, {
        last_notified_at: nowIso,
        last_notified_message_id: msg.id,
        recipient_user_id: Number(msg.creator_user_id || 0) || null,
      });
      toUpsert.push({
        ticket_id: msg.ticket_id,
        recipient_discord_id: msg.creator_discord_id,
        recipient_user_id: Number(msg.creator_user_id || 0) || null,
        last_notified_at: notifMap.get(key).last_notified_at,
        last_notified_message_id: msg.id,
      });
    }
  }

  if (toUpsert.length) {
    for (const row of toUpsert) {
      // Manual upsert (older deployments might not have a matching unique constraint for ON CONFLICT).
      const update = await env.DB.prepare(
        `
        UPDATE ticket_notification_state
        SET recipient_user_id = ?, last_notified_at = ?, last_notified_message_id = ?
        WHERE ticket_id = ? AND recipient_discord_id = ?
        `
      )
        .bind(
          row.recipient_user_id,
          row.last_notified_at,
          row.last_notified_message_id,
          row.ticket_id,
          row.recipient_discord_id
        )
        .run();

      if (!update?.meta?.changes) {
        await env.DB.prepare(
          `
          INSERT INTO ticket_notification_state (
            ticket_id, recipient_discord_id, recipient_user_id, last_notified_at, last_notified_message_id
          ) VALUES (?, ?, ?, ?, ?)
          `
        )
          .bind(
            row.ticket_id,
            row.recipient_discord_id,
            row.recipient_user_id,
            row.last_notified_at,
            row.last_notified_message_id
          )
          .run();
      }
    }
  }

  const messageIds = messages.map((msg) => msg.id);
  const placeholders = messageIds.map(() => '?').join(',');
  const attachments = await env.DB.prepare(
    `SELECT * FROM ticket_attachments WHERE ticket_message_id IN (${placeholders})`
  )
    .bind(...messageIds)
    .all();

  return jsonResponse({
    messages,
    attachments: attachments.results || [],
  });
};
