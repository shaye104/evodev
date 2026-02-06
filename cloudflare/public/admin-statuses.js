const loadStatuses = async () => {
  const res = await fetch('/api/admin/statuses');
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  const container = document.querySelector('[data-status-list]');
  container.innerHTML = '';
  data.statuses.forEach((status) => {
    const form = document.createElement('form');
    form.className = 'form inline-form';
    form.innerHTML = `
      <input type="text" name="name" value="${status.name || ''}" required>
      <input type="text" name="slug" value="${status.slug || ''}" required>
      <input type="number" name="sort_order" value="${status.sort_order || 0}">
      <label class="checkbox">
        <input type="checkbox" name="is_default_open" value="1" ${status.is_default_open ? 'checked' : ''}>
        Default open
      </label>
      <label class="checkbox">
        <input type="checkbox" name="is_closed" value="1" ${status.is_closed ? 'checked' : ''}>
        Closed
      </label>
      <button class="btn secondary" type="submit">Update</button>
    `;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      await fetch(`/api/admin/statuses/${status.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          slug: formData.get('slug'),
          sort_order: Number(formData.get('sort_order') || 0),
          is_default_open: formData.get('is_default_open') === '1',
          is_closed: formData.get('is_closed') === '1',
        }),
      });
      loadStatuses();
    });
    container.appendChild(form);
  });
};

const handleCreate = async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  await fetch('/api/admin/statuses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: formData.get('name'),
      slug: formData.get('slug'),
      sort_order: Number(formData.get('sort_order') || 0),
      is_default_open: formData.get('is_default_open') === '1',
      is_closed: formData.get('is_closed') === '1',
    }),
  });
  event.target.reset();
  loadStatuses();
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-create-status]').addEventListener('submit', handleCreate);
  loadStatuses();
});
