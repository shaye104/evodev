const loadPanels = async () => {
  const res = await fetch('/api/panels');
  const data = await res.json();
  const select = document.querySelector('[data-panel-select]');
  if (!select) return;
  data.panels.forEach((panel) => {
    const option = document.createElement('option');
    option.value = panel.id;
    option.textContent = panel.name;
    select.appendChild(option);
  });
};

const handleSubmit = async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const res = await fetch('/api/tickets', {
    method: 'POST',
    body: formData,
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  if (data.public_id) {
    window.location.href = `/ticket.html?id=${data.public_id}`;
    return;
  }
  alert(data.error || 'Failed to create ticket.');
};

document.addEventListener('DOMContentLoaded', () => {
  loadPanels();
  const form = document.querySelector('[data-ticket-form]');
  if (form) form.addEventListener('submit', handleSubmit);
});
