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
    return { label, className };
  }
  return { label: 'User', className: 'role-user' };
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
    info.appendChild(name);
    info.appendChild(roleBadge);
    author.appendChild(avatar);
    author.appendChild(info);
    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = msg.created_at;
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
};

const handleReply = async (event) => {
  event.preventDefault();
  const id = getTicketId();
  const formData = new FormData(event.target);
  const res = await fetch(`/api/tickets/${id}/messages`, {
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

document.addEventListener('DOMContentLoaded', () => {
  fetchTicket();
  const form = document.querySelector('[data-reply-form]');
  if (form) form.addEventListener('submit', handleReply);
});
