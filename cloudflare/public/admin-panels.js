const loadPanels = async () => {
  const res = await fetch('/api/admin/panels');
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  const container = document.querySelector('[data-panels-list]');
  container.innerHTML = '';
  data.panels.forEach((panel) => {
    const form = document.createElement('form');
    form.className = 'form inline-form';
    form.innerHTML = `
      <input type="text" name="name" value="${panel.name || ''}" required>
      <input type="text" name="description" value="${panel.description || ''}">
      <input type="number" name="sort_order" value="${panel.sort_order || 0}">
      <label class="checkbox">
        <input type="checkbox" name="is_active" value="1" ${panel.is_active ? 'checked' : ''}>
        Active
      </label>
      <button class="btn secondary" type="submit">Update</button>
    `;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      await fetch(`/api/admin/panels/${panel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          description: formData.get('description'),
          sort_order: Number(formData.get('sort_order') || 0),
          is_active: formData.get('is_active') === '1',
        }),
      });
      loadPanels();
    });
    container.appendChild(form);
  });
};

const handleCreate = async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  await fetch('/api/admin/panels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: formData.get('name'),
      description: formData.get('description'),
      sort_order: Number(formData.get('sort_order') || 0),
      is_active: formData.get('is_active') === '1',
    }),
  });
  event.target.reset();
  loadPanels();
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-create-panel]').addEventListener('submit', handleCreate);
  loadPanels();
});
