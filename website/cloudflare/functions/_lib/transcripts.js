import { nowIso } from './utils.js';

const escapeHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatDateTimeUtc = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const dateFmt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${dateFmt.format(d)} at ${timeFmt.format(d)} UTC`;
};

async function buildTicketTranscriptSnapshot(env, ticketPublicId) {
  const ticket = await env.DB.prepare(
    `
    SELECT t.*,
      p.name AS panel_name,
      s.name AS status_name,
      s.is_closed AS status_is_closed,
      cu.discord_username AS creator_username,
      sm.discord_id AS assigned_discord_id,
      au.discord_username AS assigned_username
    FROM tickets t
    LEFT JOIN ticket_panels p ON t.panel_id = p.id
    LEFT JOIN ticket_statuses s ON t.status_id = s.id
    LEFT JOIN users cu ON t.creator_user_id = cu.id
    LEFT JOIN staff_members sm ON t.assigned_staff_id = sm.id
    LEFT JOIN users au ON sm.user_id = au.id
    WHERE t.public_id = ?
    LIMIT 1
    `
  )
    .bind(ticketPublicId)
    .first();

  if (!ticket) return null;

  const messagesRes = await env.DB.prepare(
    `
    SELECT tm.*,
      u.discord_username AS author_username,
      u.discord_avatar AS author_avatar,
      sm.id AS author_staff_id,
      sr.name AS author_role_name,
      sr.is_admin AS author_is_admin,
      sr.color_bg AS author_role_color_bg,
      sr.color_text AS author_role_color_text
    FROM ticket_messages tm
    LEFT JOIN users u ON tm.author_user_id = u.id
    LEFT JOIN staff_members sm ON sm.user_id = u.id AND sm.is_active = 1
    LEFT JOIN staff_roles sr ON sm.role_id = sr.id
    WHERE tm.ticket_id = ?
    ORDER BY tm.created_at ASC
    `
  )
    .bind(ticket.id)
    .all();
  const messages = messagesRes.results || [];

  const attachmentsRes = await env.DB.prepare(
    `
    SELECT *
    FROM ticket_attachments
    WHERE ticket_message_id IN (
      SELECT id FROM ticket_messages WHERE ticket_id = ?
    )
    ORDER BY created_at ASC, id ASC
    `
  )
    .bind(ticket.id)
    .all();
  const attachments = attachmentsRes.results || [];
  const attachmentMap = new Map();
  for (const att of attachments) {
    if (!attachmentMap.has(att.ticket_message_id)) attachmentMap.set(att.ticket_message_id, []);
    attachmentMap.get(att.ticket_message_id).push(att);
  }

  const claimsRes = await env.DB.prepare(
    `
    SELECT tc.*, sm.discord_id AS staff_discord_id, u.discord_username AS staff_username
    FROM ticket_claims tc
    LEFT JOIN staff_members sm ON tc.staff_id = sm.id
    LEFT JOIN users u ON sm.user_id = u.id
    WHERE tc.ticket_id = ?
    ORDER BY tc.created_at ASC, tc.id ASC
    `
  )
    .bind(ticket.id)
    .all();

  const auditRes = await env.DB.prepare(
    `
    SELECT *
    FROM audit_logs
    WHERE entity_type = 'ticket' AND entity_id = ?
    ORDER BY created_at ASC, id ASC
    `
  )
    .bind(ticket.public_id)
    .all();

  const messagesWithAttachments = messages.map((m) => ({
    ...m,
    attachments: attachmentMap.get(m.id) || [],
  }));

  return {
    schema_version: 1,
    generated_at: nowIso(),
    ticket,
    messages: messagesWithAttachments,
    claims: claimsRes.results || [],
    audit_logs: auditRes.results || [],
  };
}

function renderTranscriptHtml(snapshot) {
  const ticket = snapshot?.ticket || {};
  const messages = snapshot?.messages || [];
  const claims = snapshot?.claims || [];
  const auditLogs = snapshot?.audit_logs || [];

  const messageHtml = messages
    .map((m) => {
      const author =
        m.author_username ||
        (m.author_type === 'staff' ? 'Staff' : 'User');
      const role =
        m.author_type === 'staff'
          ? m.author_role_name || (m.author_is_admin ? 'Admin' : 'Staff')
          : 'User';
      const roleBg = m.author_role_color_bg || '';
      const roleText = m.author_role_color_text || '';
      const roleStyle = roleBg
        ? ` style="background:${escapeHtml(roleBg)};border-color:${escapeHtml(roleBg)};color:${escapeHtml(roleText || '#ffffff')};"`
        : '';

      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      const attsHtml = atts.length
        ? `<div class="attachments"><div class="attachments-title">Attachments</div><ul>${atts
            .map((a) => {
              const href = a.storage_url ? a.storage_url : `/api/attachments/${a.id}`;
              return `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(a.filename || 'attachment')}</a></li>`;
            })
            .join('')}</ul></div>`
        : '';

      return `
        <div class="message">
          <div class="message-meta">
            <div class="message-author">
              <span class="author-name">${escapeHtml(author)}</span>
              <span class="role-pill"${roleStyle}>${escapeHtml(role)}</span>
            </div>
            <div class="message-time">${escapeHtml(formatDateTimeUtc(m.created_at))}</div>
          </div>
          <pre class="message-body">${escapeHtml(m.body || '')}</pre>
          ${attsHtml}
        </div>
      `;
    })
    .join('');

  const claimsHtml = claims.length
    ? `<ul>${claims
        .map((c) => {
          const who = c.staff_username || c.staff_discord_id || 'staff';
          return `<li><b>${escapeHtml(c.action || '')}</b> by ${escapeHtml(who)} at ${escapeHtml(
            formatDateTimeUtc(c.created_at)
          )}</li>`;
        })
        .join('')}</ul>`
    : '<div class="muted">No claim history.</div>';

  const auditHtml = auditLogs.length
    ? `<ul>${auditLogs
        .map((l) => {
          const who = l.actor_discord_id || l.actor_user_id || 'system';
          return `<li><b>${escapeHtml(l.action || '')}</b> by ${escapeHtml(who)} at ${escapeHtml(
            formatDateTimeUtc(l.created_at)
          )}</li>`;
        })
        .join('')}</ul>`
    : '<div class="muted">No audit events.</div>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ticket Transcript #${escapeHtml(ticket.public_id || '')}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    h2 { margin: 24px 0 8px; font-size: 16px; }
    .muted { color: #555; font-size: 12px; }
    .meta { display: grid; grid-template-columns: 180px 1fr; gap: 6px 12px; font-size: 13px; }
    .meta div { padding: 2px 0; }
    .thread { margin-top: 12px; }
    .message { border: 1px solid #ddd; border-radius: 10px; padding: 12px; margin: 12px 0; }
    .message-meta { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .message-author { display: flex; align-items: center; gap: 8px; }
    .author-name { font-weight: 700; font-size: 13px; }
    .role-pill { display: inline-flex; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; border: 1px solid #ddd; }
    .message-time { font-size: 12px; color: #555; }
    .message-body { white-space: pre-wrap; margin: 10px 0 0; font-family: inherit; font-size: 13px; }
    .attachments { margin-top: 10px; }
    .attachments-title { font-weight: 700; font-size: 12px; margin-bottom: 4px; }
    a { color: #1a57af; }
  </style>
</head>
<body>
  <h1>Ticket Transcript #${escapeHtml(ticket.public_id || '')}</h1>
  <div class="muted">Generated: ${escapeHtml(formatDateTimeUtc(snapshot.generated_at))}</div>

  <h2>Ticket</h2>
  <div class="meta">
    <div><b>Subject</b></div><div>${escapeHtml(ticket.subject || '')}</div>
    <div><b>Panel</b></div><div>${escapeHtml(ticket.panel_name || '')}</div>
    <div><b>Status</b></div><div>${escapeHtml(ticket.status_name || '')}</div>
    <div><b>Created</b></div><div>${escapeHtml(formatDateTimeUtc(ticket.created_at))}</div>
    <div><b>Updated</b></div><div>${escapeHtml(formatDateTimeUtc(ticket.updated_at))}</div>
    <div><b>Last message</b></div><div>${escapeHtml(formatDateTimeUtc(ticket.last_message_at))}</div>
    <div><b>Closed</b></div><div>${escapeHtml(formatDateTimeUtc(ticket.closed_at))}</div>
    <div><b>Creator</b></div><div>${escapeHtml(ticket.creator_username || ticket.creator_discord_id || ticket.creator_email || '')}</div>
    <div><b>Assigned</b></div><div>${escapeHtml(ticket.assigned_username || ticket.assigned_discord_id || '')}</div>
  </div>

  <h2>Messages</h2>
  <div class="thread">
    ${messageHtml || '<div class="muted">No messages.</div>'}
  </div>

  <h2>Claims</h2>
  ${claimsHtml}

  <h2>Audit</h2>
  ${auditHtml}
</body>
</html>`;
}

export { buildTicketTranscriptSnapshot, renderTranscriptHtml };
