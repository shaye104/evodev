const getTicketId = () => new URLSearchParams(window.location.search).get('id');

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
    meta.innerHTML = `<strong>${msg.author_type}</strong><span>${msg.created_at}</span>`;
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

document.addEventListener('DOMContentLoaded', async () => {
  await loadDropdowns();
  await fetchTicket();
  document.querySelector('[data-reply-form]').addEventListener('submit', handleReply);
  document.querySelector('[data-claim-button]').addEventListener('click', handleClaim);
  document.querySelector('[data-status-button]').addEventListener('click', handleStatus);
  document.querySelector('[data-assign-button]').addEventListener('click', handleAssign);
});
