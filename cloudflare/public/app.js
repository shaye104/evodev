(() => {
  if (!window.EventSource) return;
  const source = new EventSource('/events');
  const toast = document.createElement('div');
  toast.className = 'toast';
  document.body.appendChild(toast);

  const showToast = (message, link) => {
    toast.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);
    if (link) {
      const anchor = document.createElement('a');
      anchor.href = link;
      anchor.textContent = 'View';
      toast.appendChild(anchor);
    }
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
  };

  const highlightRow = (id) => {
    const row = document.querySelector(`[data-ticket-id="${id}"]`);
    if (!row) return;
    row.classList.add('highlight');
    setTimeout(() => row.classList.remove('highlight'), 3000);
  };

  source.addEventListener('ticket.message', (event) => {
    const data = JSON.parse(event.data);
    highlightRow(data.public_id);
    showToast(`New reply on #${data.public_id}`, `/tickets/${data.public_id}`);
  });

  source.addEventListener('ticket.created', (event) => {
    const data = JSON.parse(event.data);
    highlightRow(data.public_id);
    showToast(`New ticket #${data.public_id}`, `/staff/tickets/${data.public_id}`);
  });

  source.addEventListener('ticket.updated', (event) => {
    const data = JSON.parse(event.data);
    highlightRow(data.public_id);
    showToast(`Ticket #${data.public_id} updated`, `/staff/tickets/${data.public_id}`);
  });
})();
