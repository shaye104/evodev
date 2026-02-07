const getTicketId = () => new URLSearchParams(window.location.search).get('id');

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const staffHasPermission = (staff, permission) => {
  if (!staff) return false;
  if (staff.is_admin) return true;
  if (!staff.permissions) return false;
  try {
    const perms = JSON.parse(staff.permissions);
    if (Array.isArray(perms)) {
      if (perms.includes('*')) return true;
      return perms.includes(permission);
    }
  } catch {}
  return false;
};

const getAvatarUrl = (msg) => {
  const discordId = msg.author_discord_id;
  const avatarHash = msg.author_avatar;
  if (discordId && avatarHash) {
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?size=64`;
  }
  const index = discordId
    ? (parseInt(String(discordId).slice(-1), 10) || 0) % 5
    : 0;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
};

const getAuthorName = (msg) => {
  if (msg.author_username) return msg.author_username;
  return msg.author_type === 'staff' ? 'Staff' : 'User';
};

const getRoleInfo = (msg) => {
  if (msg.author_type === 'staff') {
    const label =
      msg.author_role_name || (msg.author_is_admin ? 'Admin' : 'Staff');
    const className = msg.author_is_admin ? 'role-admin' : 'role-staff';
    return {
      label,
      className,
      colorBg: msg.author_role_color_bg || null,
      colorText: msg.author_role_color_text || null,
    };
  }
  return { label: 'User', className: 'role-user' };
};

const getOrdinal = (value) => {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
};

const formatClock = (date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatLongDate = (date) => {
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const day = String(date.getDate());
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year} at ${formatClock(date)}`;
};

const formatRelativeTime = (value) => {
  const parsed =
    typeof window.supportParseDateTime === 'function'
      ? window.supportParseDateTime(value)
      : new Date(value);
  const date = parsed instanceof Date ? parsed : null;
  if (!date || Number.isNaN(date.getTime())) {
    return typeof window.supportFormatDateTime === 'function'
      ? window.supportFormatDateTime(value)
      : value;
  }
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (dateDay.getTime() === yesterday.getTime()) {
    return `yesterday at ${formatClock(date)}`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }
  return typeof window.supportFormatLongDateTime === 'function'
    ? window.supportFormatLongDateTime(date)
    : formatLongDate(date);
};

const renderTicket = (payload) => {
  const { ticket, messages, attachments } = payload;
  document.querySelector('[data-ticket-title]').textContent = `Ticket #${ticket.public_id}`;
  document.querySelector('[data-ticket-subject]').textContent = ticket.subject || 'Support ticket';
  document.querySelector('[data-ticket-meta]').textContent = `${ticket.panel_name || 'General'} • ${ticket.status_name || 'Open'}`;

  const attachmentMap = new Map();
  (attachments || []).forEach((att) => {
    if (!attachmentMap.has(att.ticket_message_id)) {
      attachmentMap.set(att.ticket_message_id, []);
    }
    attachmentMap.get(att.ticket_message_id).push(att);
  });

  const thread = document.querySelector('[data-ticket-thread]');
  thread.innerHTML = '';
  messages.forEach((msg) => {
    const article = document.createElement('article');
    article.className = 'message';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const author = document.createElement('div');
    author.className = 'message-author';
    const avatar = document.createElement('img');
    avatar.className = 'message-avatar';
    avatar.src = getAvatarUrl(msg);
    avatar.alt = `${getAuthorName(msg)} avatar`;
    avatar.loading = 'lazy';
    const info = document.createElement('div');
    info.className = 'author-info';
    const name = document.createElement('span');
    name.className = 'author-name';
    name.textContent = getAuthorName(msg);
    const role = getRoleInfo(msg);
    const roleBadge = document.createElement('span');
    roleBadge.className = `role-pill ${role.className}`;
    roleBadge.textContent = role.label;
    if (role.colorBg) {
      roleBadge.style.backgroundColor = role.colorBg;
      roleBadge.style.borderColor = role.colorBg;
      roleBadge.style.color = role.colorText || '#ffffff';
    }
    info.appendChild(name);
    info.appendChild(roleBadge);
    author.appendChild(avatar);
    author.appendChild(info);
    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = formatRelativeTime(msg.created_at);
    meta.appendChild(author);
    meta.appendChild(time);
    const body = document.createElement('pre');
    body.className = 'message-body';
    body.textContent = msg.body;
    article.appendChild(meta);
    article.appendChild(body);
    const attachmentsList = attachmentMap.get(msg.id) || [];
    if (attachmentsList.length) {
      const wrap = document.createElement('div');
      wrap.className = 'attachments';
      attachmentsList.forEach((att) => {
        const link = document.createElement('a');
        link.href = att.storage_url || `/api/attachments/${att.id}`;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = `📎 ${att.filename}`;
        wrap.appendChild(link);
      });
      article.appendChild(wrap);
    }
    thread.appendChild(article);
  });

  document.querySelector('[data-claim-button]').textContent = ticket.assigned_staff_id ? 'Unclaim' : 'Claim';
  document.querySelector('[data-claim-button]').dataset.action = ticket.assigned_staff_id ? 'unclaim' : 'claim';
};

const loadDropdowns = async () => {
  const statusSelect = document.querySelector('[data-status-select]');
  const assignSelect = document.querySelector('[data-assign-select]');
  const statusBtn = document.querySelector('[data-status-button]');
  const assignBtn = document.querySelector('[data-assign-button]');

  const statusesRes = await fetch('/api/statuses').catch(() => null);
  const statusesData = statusesRes ? await safeJson(statusesRes) : null;

  if (statusSelect) statusSelect.innerHTML = '';
  if (statusesRes?.ok && statusesData?.statuses && Array.isArray(statusesData.statuses)) {
    if (statusSelect) {
      statusesData.statuses.forEach((status) => {
        const option = document.createElement('option');
        option.value = status.id;
        option.textContent = status.name;
        statusSelect.appendChild(option);
      });
    }
    if (statusSelect) statusSelect.disabled = false;
    if (statusBtn) statusBtn.disabled = false;
  } else {
    if (statusSelect) statusSelect.disabled = true;
    if (statusBtn) statusBtn.disabled = true;
  }

  // Staff list for assignment (may be forbidden if the role lacks tickets.assign).
  if (assignSelect) assignSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Unassigned';
  if (assignSelect) assignSelect.appendChild(defaultOption);

  const staffRes = await fetch('/api/staff/members').catch(() => null);
  const staffData = staffRes ? await safeJson(staffRes) : null;
  if (staffRes?.ok && staffData?.staff && Array.isArray(staffData.staff)) {
    if (assignSelect) {
      staffData.staff.forEach((member) => {
        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = member.discord_username || member.discord_id;
        assignSelect.appendChild(option);
      });
    }
    if (assignSelect) assignSelect.disabled = false;
    if (assignBtn) assignBtn.disabled = false;
  } else {
    if (assignSelect) assignSelect.disabled = true;
    if (assignBtn) assignBtn.disabled = true;
  }
};

const fetchTicket = async () => {
  const id = getTicketId();
  if (!id) return;
  const res = await fetch(`/api/staff/tickets/${id}`);
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await safeJson(res);
  if (!data) {
    window.location.href = '/login.html';
    return;
  }
  renderTicket(data);
  document.querySelector('[data-status-select]').value = data.ticket.status_id || '';
  document.querySelector('[data-assign-select]').value = data.ticket.assigned_staff_id || '';
};

const handleReply = async (event) => {
  event.preventDefault();
  const id = getTicketId();
  const formData = new FormData(event.target);
  const res = await fetch(`/api/staff/tickets/${id}/messages`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to send reply');
    return;
  }
  event.target.reset();
  await fetchTicket();
};

const handleClaim = async () => {
  const id = getTicketId();
  const action = document.querySelector('[data-claim-button]').dataset.action;
  await fetch(`/api/staff/tickets/${id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  fetchTicket();
};

const handleStatus = async () => {
  const id = getTicketId();
  const statusId = document.querySelector('[data-status-select]').value;
  await fetch(`/api/staff/tickets/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_id: statusId }),
  });
  fetchTicket();
};

const handleAssign = async () => {
  const id = getTicketId();
  const staffId = document.querySelector('[data-assign-select]').value;
  await fetch(`/api/staff/tickets/${id}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staff_id: staffId || null }),
  });
  fetchTicket();
};

const renderTranscripts = (rows) => {
  const el = document.querySelector('[data-transcripts-list]');
  if (!el) return;
  if (!rows.length) {
    el.textContent = 'No transcripts yet.';
    return;
  }
  const id = getTicketId();
  const formatTime = (v) => window.supportFormatDateTime?.(v) || v || '';
  el.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Created</th>
          <th>Trigger</th>
          <th>Download</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((t) => {
            const created = formatTime(t.created_at);
            const trigger = t.trigger || 'manual';
            const htmlUrl = `/api/staff/tickets/${id}/transcripts/${t.id}?format=html`;
            const jsonUrl = `/api/staff/tickets/${id}/transcripts/${t.id}?format=json`;
            return `
              <tr>
                <td>${created}</td>
                <td>${trigger}</td>
                <td class="inline">
                  <a class="btn secondary" target="_blank" rel="noopener" href="${htmlUrl}">HTML</a>
                  <a class="btn secondary" target="_blank" rel="noopener" href="${jsonUrl}">JSON</a>
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
};

const loadTranscripts = async () => {
  const id = getTicketId();
  const el = document.querySelector('[data-transcripts-list]');
  if (!id || !el) return;
  el.textContent = 'Loading…';
  const res = await fetch(`/api/staff/tickets/${id}/transcripts`);
  if (res.status === 403) {
    el.textContent = 'You do not have permission to view transcripts (requires View tickets).';
    return;
  }
  if (res.status === 401) {
    el.textContent = 'Please login to view transcripts.';
    return;
  }
  if (!res.ok) {
    el.textContent = 'Unable to load transcripts. Please refresh and try again.';
    return;
  }
  const data = await safeJson(res);
  if (!data) {
    el.textContent = 'Unable to load transcripts. Please refresh and try again.';
    return;
  }
  renderTranscripts(data.transcripts || []);
};

const handleGenerateTranscript = async () => {
  const id = getTicketId();
  const btn = document.querySelector('[data-transcript-generate]');
  if (!id || !btn) return;
  btn.disabled = true;
  const res = await fetch(`/api/staff/tickets/${id}/transcripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'manual' }),
  });
  btn.disabled = false;
  const data = (await safeJson(res)) || {};
  if (!res.ok) {
    alert(data.error || 'Failed to generate transcript');
    return;
  }
  loadTranscripts();
};

document.addEventListener('DOMContentLoaded', async () => {
  // Bind buttons first so the page still works even if a fetch fails.
  const replyForm = document.querySelector('[data-reply-form]');
  if (replyForm) replyForm.addEventListener('submit', handleReply);
  const claimBtn = document.querySelector('[data-claim-button]');
  if (claimBtn) claimBtn.addEventListener('click', handleClaim);
  const statusBtn = document.querySelector('[data-status-button]');
  if (statusBtn) statusBtn.addEventListener('click', handleStatus);
  const assignBtn = document.querySelector('[data-assign-button]');
  if (assignBtn) assignBtn.addEventListener('click', handleAssign);
  const transcriptBtn = document.querySelector('[data-transcript-generate]');
  if (transcriptBtn) transcriptBtn.addEventListener('click', handleGenerateTranscript);

  // Use /api/me to hide/disable controls based on role permissions.
  const meRes = await fetch('/api/me').catch(() => null);
  const me = meRes ? await safeJson(meRes) : null;
  const staff = me?.staff || null;

  const canClaim = staffHasPermission(staff, 'tickets.claim');
  const canStatus = staffHasPermission(staff, 'tickets.status');
  const canAssign = staffHasPermission(staff, 'tickets.assign');
  const canReply = staffHasPermission(staff, 'tickets.reply');
  const canView = staffHasPermission(staff, 'tickets.view');

  if (claimBtn) claimBtn.disabled = !canClaim;
  const statusSelect = document.querySelector('[data-status-select]');
  if (statusSelect) statusSelect.disabled = !canStatus;
  if (statusBtn) statusBtn.disabled = !canStatus;
  const assignSelect = document.querySelector('[data-assign-select]');
  if (assignSelect) assignSelect.disabled = !canAssign;
  if (assignBtn) assignBtn.disabled = !canAssign;
  if (replyForm) {
    const textarea = replyForm.querySelector('textarea[name="message"]');
    const file = replyForm.querySelector('input[type="file"][name="attachments"]');
    const submit = replyForm.querySelector('button[type="submit"]');
    if (textarea) textarea.disabled = !canReply;
    if (file) file.disabled = !canReply;
    if (submit) submit.disabled = !canReply;
  }
  if (transcriptBtn) transcriptBtn.disabled = !canView;

  try {
    await loadDropdowns();
  } catch {}
  // Ensure dropdown enablement reflects permissions even if the fetch succeeded.
  if (statusSelect) statusSelect.disabled = !canStatus;
  if (statusBtn) statusBtn.disabled = !canStatus;
  if (assignSelect) assignSelect.disabled = !canAssign;
  if (assignBtn) assignBtn.disabled = !canAssign;
  try {
    await fetchTicket();
  } catch {}
  if (canView) {
    try {
      await loadTranscripts();
    } catch {}
  } else {
    const el = document.querySelector('[data-transcripts-list]');
    if (el) el.textContent = 'You do not have permission to view transcripts (requires View tickets).';
  }
});
