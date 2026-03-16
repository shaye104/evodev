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
  if (msg.author_nickname) return msg.author_nickname;
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

  const isClosed = Boolean(ticket.is_closed) || Boolean(ticket.closed_at);
  const replyForm = document.querySelector('[data-reply-form]');
  if (replyForm) {
    const textarea = replyForm.querySelector('textarea[name="message"]');
    const file = replyForm.querySelector('input[type="file"][name="attachments"]');
    const submit = replyForm.querySelector('button[type="submit"]');
    if (textarea) textarea.disabled = isClosed;
    if (file) file.disabled = isClosed;
    if (submit) submit.disabled = isClosed;
    if (isClosed) {
      // Show a small note inline above the form, once.
      let note = replyForm.querySelector('.form-note-closed');
      if (!note) {
        note = document.createElement('div');
        note.className = 'muted form-note-closed';
        note.style.marginBottom = '10px';
        note.textContent = 'This ticket is closed. You can no longer reply.';
        replyForm.prepend(note);
      }
    }
  }

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
};

const fetchTicket = async () => {
  const id = getTicketId();
  if (!id) return;
  const res = await fetch(`/api/tickets/${id}`);
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  if (data.error) {
    alert(data.error);
    return;
  }
  renderTicket(data);
  // Mark as read (best-effort).
  fetch(`/api/tickets/${id}/read`, { method: 'POST' }).catch(() => null);
};

const handleReply = async (event) => {
  event.preventDefault();
  const id = getTicketId();
  const form = event.target;
  const textarea = form.querySelector('textarea[name="message"]');
  if (textarea && textarea.disabled) {
    alert('This ticket is closed and cannot be replied to.');
    return;
  }
  const files = Array.from(form.querySelector('input[type="file"][name="attachments"]')?.files || []);
  const maxBytes = 500 * 1024;
  const oversize = files.find((f) => f && f.size > maxBytes);
  if (oversize) {
    alert(`"${oversize.name}" is too large. Max attachment size is 500KB.`);
    return;
  }
  const formData = new FormData(form);
  const res = await fetch(`/api/tickets/${id}/messages`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    if (Array.isArray(data.attachments) && data.attachments.length) {
      alert(`${data.error || 'Attachment rejected.'}\n\n${data.attachments
        .map((a) => `${a.filename}: ${a.reason}`)
        .join('\n')}`);
      return;
    }
    alert(data.error || 'Failed to send reply');
    return;
  }
  event.target.reset();
  await fetchTicket();
};

document.addEventListener('DOMContentLoaded', () => {
  fetchTicket();
  const form = document.querySelector('[data-reply-form]');
  if (form) form.addEventListener('submit', handleReply);
});
