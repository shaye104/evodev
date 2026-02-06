const renderTickets = (tickets) => {
  const tbody = document.querySelector('[data-ticket-body]');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!tickets.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5">No tickets yet.</td>';
    tbody.appendChild(row);
    return;
  }
  tickets.forEach((ticket) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><a href="/ticket.html?id=${ticket.public_id}">#${ticket.public_id}</a></td>
      <td>${ticket.subject || 'Support ticket'}</td>
      <td>${ticket.panel_name || 'General'}</td>
      <td><span class="pill">${ticket.status_name || 'Open'}</span></td>
      <td>${ticket.last_message_at || ticket.updated_at || ''}</td>
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
