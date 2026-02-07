const getTicketId = () => new URLSearchParams(window.location.search).get('id');

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
  const [statusesRes, staffRes] = await Promise.all([
    fetch('/api/statuses'),
    fetch('/api/admin/staff'),
  ]);
  const statusesData = await statusesRes.json();
  const staffData = await staffRes.json();
  const statusSelect = document.querySelector('[data-status-select]');
  statusesData.statuses.forEach((status) => {
    const option = document.createElement('option');
    option.value = status.id;
    option.textContent = status.name;
    statusSelect.appendChild(option);
  });

  const assignSelect = document.querySelector('[data-assign-select]');
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Unassigned';
  assignSelect.appendChild(defaultOption);
  staffData.staff.forEach((member) => {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = member.discord_username || member.discord_id;
    assignSelect.appendChild(option);
  });
};

const fetchTicket = async () => {
  const id = getTicketId();
  if (!id) return;
  const res = await fetch(`/api/staff/tickets/${id}`);
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  renderTicket(data);
  document.querySelector('[data-status-select]').value = data.ticket.status_id || '';
  document.querySelector('[data-assign-select]').value = data.ticket.assigned_staff_id || '';
  loadTranscripts();
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
  if (!res.ok) {
    el.textContent = 'Unable to load transcripts.';
    return;
  }
  const data = await res.json();
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || 'Failed to generate transcript');
    return;
  }
  loadTranscripts();
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadDropdowns();
  await fetchTicket();
  await loadTranscripts();
  document.querySelector('[data-reply-form]').addEventListener('submit', handleReply);
  document.querySelector('[data-claim-button]').addEventListener('click', handleClaim);
  document.querySelector('[data-status-button]').addEventListener('click', handleStatus);
  document.querySelector('[data-assign-button]').addEventListener('click', handleAssign);
  document
    .querySelector('[data-transcript-generate]')
    .addEventListener('click', handleGenerateTranscript);
});
