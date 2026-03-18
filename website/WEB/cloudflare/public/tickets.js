const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getStatusTone = (statusName) => {
  const status = String(statusName || '').trim().toLowerCase();
  if (status.includes('close') || status.includes('resolved')) return 'status-closed';
  if (status.includes('await') || status.includes('reply')) return 'status-awaiting';
  return 'status-open';
};

const updateSummary = (tickets) => {
  const totalEl = document.querySelector('[data-summary-total]');
  const openEl = document.querySelector('[data-summary-open]');
  const awaitingEl = document.querySelector('[data-summary-awaiting]');
  const closedEl = document.querySelector('[data-summary-closed]');
  if (!totalEl || !openEl || !awaitingEl || !closedEl) return;

  let open = 0;
  let awaiting = 0;
  let closed = 0;

  tickets.forEach((ticket) => {
    const tone = getStatusTone(ticket.status_name);
    if (tone === 'status-closed') closed += 1;
    else if (tone === 'status-awaiting') awaiting += 1;
    else open += 1;
  });

  totalEl.textContent = String(tickets.length);
  openEl.textContent = String(open);
  awaitingEl.textContent = String(awaiting);
  closedEl.textContent = String(closed);
};

const renderTickets = (tickets) => {
  const tbody = document.querySelector('[data-ticket-body]');
  if (!tbody) return;
  tbody.innerHTML = '';
  updateSummary(tickets);

  if (!tickets.length) {
    const row = document.createElement('tr');
    row.className = 'ticket-row-empty';
    row.innerHTML = '<td colspan="6">No tickets yet. Open one to get support started.</td>';
    tbody.appendChild(row);
    return;
  }

  tickets.forEach((ticket) => {
    const row = document.createElement('tr');
    const statusName = ticket.status_name || 'Open';
    const statusTone = getStatusTone(statusName);
    const updatedAt = window.supportFormatDateTime?.(ticket.last_message_at || ticket.updated_at) ||
      (ticket.last_message_at || ticket.updated_at || '');
    const href = `/ticket.html?id=${ticket.public_id}`;
    row.innerHTML = `
      <td class="ticket-id-cell"><a href="${href}" class="ticket-id-link">#${escapeHtml(ticket.public_id)}</a></td>
      <td class="ticket-subject-cell">${escapeHtml(ticket.subject || 'Support ticket')}</td>
      <td>${escapeHtml(ticket.panel_name || 'General')}</td>
      <td><span class="pill ${statusTone}">${escapeHtml(statusName)}</span></td>
      <td class="ticket-updated-cell">${escapeHtml(updatedAt)}</td>
      <td><a class="btn secondary small ticket-view-btn" href="${href}">Open</a></td>
    `;
    tbody.appendChild(row);
  });
};

const fetchTickets = async () => {
  const res = await fetch('/api/tickets');
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  renderTickets(data.tickets || []);
};

const initEvents = () => {
  if (!window.EventSource) return;
  const source = new EventSource('/api/events');
  source.addEventListener('ticket.updated', () => {
    fetchTickets();
  });
};

document.addEventListener('DOMContentLoaded', () => {
  fetchTickets();
  initEvents();
});
