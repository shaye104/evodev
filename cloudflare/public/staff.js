const renderTickets = (tickets) => {
  const tbody = document.querySelector('[data-ticket-body]');
  tbody.innerHTML = '';
  if (!tickets.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="6">No tickets found.</td>';
    tbody.appendChild(row);
    return;
  }
  tickets.forEach((ticket) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><a href="/staff-ticket.html?id=${ticket.public_id}">#${ticket.public_id}</a></td>
      <td>${ticket.subject || 'Support ticket'}</td>
      <td>${ticket.panel_name || 'General'}</td>
      <td><span class="pill">${ticket.status_name || 'Open'}</span></td>
      <td>${ticket.assigned_username || ticket.assigned_discord_id || 'Unassigned'}</td>
      <td>${ticket.last_message_at || ticket.updated_at || ''}</td>
    `;
    tbody.appendChild(row);
  });
};

const loadFilters = async () => {
  const [statusesRes, panelsRes] = await Promise.all([
    fetch('/api/statuses'),
    fetch('/api/panels'),
  ]);
  const statusesData = await statusesRes.json();
  const panelsData = await panelsRes.json();
  const statusSelect = document.querySelector('[data-filter-status]');
  const panelSelect = document.querySelector('[data-filter-panel]');

  statusesData.statuses.forEach((status) => {
    const option = document.createElement('option');
    option.value = status.id;
    option.textContent = status.name;
    statusSelect.appendChild(option);
  });

  panelsData.panels.forEach((panel) => {
    const option = document.createElement('option');
    option.value = panel.id;
    option.textContent = panel.name;
    panelSelect.appendChild(option);
  });
};

const fetchTickets = async () => {
  const statusId = document.querySelector('[data-filter-status]').value;
  const panelId = document.querySelector('[data-filter-panel]').value;
  const params = new URLSearchParams();
  if (statusId) params.set('status_id', statusId);
  if (panelId) params.set('panel_id', panelId);
  const res = await fetch(`/api/staff/tickets?${params.toString()}`);
  if (res.status === 403) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  renderTickets(data.tickets || []);
};

const initEvents = () => {
  if (!window.EventSource) return;
  const source = new EventSource('/api/events');
  source.addEventListener('ticket.updated', () => fetchTickets());
};

document.addEventListener('DOMContentLoaded', () => {
  loadFilters().then(fetchTickets);
  document.querySelector('[data-filter-form]').addEventListener('change', fetchTickets);
  initEvents();
});
