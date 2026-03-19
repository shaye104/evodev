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

const embedMode = new URLSearchParams(window.location.search).get('embed') === '1';

const setHistoryVisible = (visible) => {
  const summary = document.querySelector('[data-ticket-summary]');
  const tableCard = document.querySelector('[data-ticket-table-card]');
  if (summary) summary.hidden = true;
  if (tableCard) tableCard.hidden = !visible;
};

const setEmbedHubState = (mode) => {
  const hub = document.querySelector('[data-embed-hub]');
  const login = hub?.querySelector('[data-embed-login]');
  const actions = hub?.querySelector('[data-embed-actions]');
  if (!hub || !login || !actions) return;
  if (!embedMode) {
    hub.hidden = true;
    return;
  }
  hub.hidden = false;
  login.hidden = mode !== 'login';
  actions.hidden = mode !== 'actions';
};

const updateEmbedPrimaryAction = (tickets) => {
  const primary = document.querySelector('[data-embed-primary-action]');
  if (!embedMode || !primary) return;
  const active = (tickets || []).find((t) => getStatusTone(t.status_name) !== 'status-closed');
  if (active?.public_id) {
    primary.textContent = 'Continue chat';
    primary.href = `/ticket.html?id=${active.public_id}&embed=1`;
  } else {
    primary.textContent = 'Open ticket';
    primary.href = '/new-ticket.html?embed=1';
  }
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
    row.innerHTML = `<td colspan="6">${embedMode ? 'No chat history yet. Start a new chat to begin.' : 'No tickets yet. Open one to get support started.'}</td>`;
    tbody.appendChild(row);
    return;
  }

  tickets.forEach((ticket) => {
    const row = document.createElement('tr');
    const statusName = ticket.status_name || 'Open';
    const statusTone = getStatusTone(statusName);
    const updatedAt = window.supportFormatDateTime?.(ticket.last_message_at || ticket.updated_at) ||
      (ticket.last_message_at || ticket.updated_at || '');
    const href = embedMode
      ? `/ticket.html?id=${ticket.public_id}&embed=1`
      : `/ticket.html?id=${ticket.public_id}`;
    row.innerHTML = `
      <td class="ticket-id-cell" data-label="Ticket"><a href="${href}" class="ticket-id-link">#${escapeHtml(ticket.public_id)}</a></td>
      <td class="ticket-subject-cell" data-label="Subject">${escapeHtml(ticket.subject || 'Support ticket')}</td>
      <td data-label="Panel">${escapeHtml(ticket.panel_name || 'General')}</td>
      <td data-label="Status"><span class="pill ${statusTone}">${escapeHtml(statusName)}</span></td>
      <td class="ticket-updated-cell" data-label="Updated">${escapeHtml(updatedAt)}</td>
      <td data-label="Action"><a class="btn secondary small ticket-view-btn" href="${href}">${embedMode ? 'Continue' : 'Open'}</a></td>
    `;
    tbody.appendChild(row);
  });
};

const fetchTickets = async (options = {}) => {
  const { allowUnauthed = false } = options;
  const res = await fetch('/api/tickets');
  if (res.status === 401) {
    if (allowUnauthed) return null;
    window.location.href = '/login.html';
    return null;
  }
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  const tickets = data.tickets || [];
  renderTickets(tickets);
  updateEmbedPrimaryAction(tickets);
  return tickets;
};

const initEvents = () => {
  if (!window.EventSource) return;
  const source = new EventSource('/api/events');
  source.addEventListener('ticket.updated', () => {
    fetchTickets({ allowUnauthed: embedMode });
  });
};

const initEmbedFlow = async () => {
  if (!embedMode) return;

  const historyBtn = document.querySelector('[data-embed-history-action]');
  if (historyBtn) {
    historyBtn.addEventListener('click', () => {
      setHistoryVisible(true);
      document.querySelector('[data-ticket-table-card]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  setHistoryVisible(false);
  const meRes = await fetch('/api/me').catch(() => null);
  const me = meRes?.ok ? await meRes.json().catch(() => null) : null;
  if (!me?.user) {
    setEmbedHubState('login');
    return;
  }
  setEmbedHubState('actions');
  await fetchTickets({ allowUnauthed: true });
};

document.addEventListener('DOMContentLoaded', () => {
  if (embedMode) {
    initEmbedFlow();
  } else {
    fetchTickets();
  }
  initEvents();
});
