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
    form.className = 'form status-grid-row';
    form.dataset.statusId = String(status.id);
    form.dataset.initial = JSON.stringify({
      name: String(status.name || ''),
      slug: String(status.slug || ''),
      sort_order: Number(status.sort_order || 0) || 0,
      is_default_open: Boolean(status.is_default_open),
      is_closed: Boolean(status.is_closed),
    });
    form.innerHTML = `
      <input type="text" name="name" value="${status.name || ''}" required>
      <input type="text" name="slug" value="${status.slug || ''}" required>
      <input type="number" name="sort_order" value="${status.sort_order || 0}">
      <label class="switch switch-compact" title="Default open">
        <input type="checkbox" name="is_default_open" value="1" aria-label="Default open" ${status.is_default_open ? 'checked' : ''}>
        <span class="switch-track" aria-hidden="true"></span>
      </label>
      <label class="switch switch-compact" title="Closed">
        <input type="checkbox" name="is_closed" value="1" aria-label="Closed" ${status.is_closed ? 'checked' : ''}>
        <span class="switch-track" aria-hidden="true"></span>
      </label>
    `;
    container.appendChild(form);
  });
};

const handleSaveAll = async () => {
  const btn = document.querySelector('[data-save-statuses]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  const forms = Array.from(document.querySelectorAll('.status-grid-row'));
  for (const form of forms) {
    if (!form.reportValidity()) continue;

    let initial = null;
    try {
      initial = JSON.parse(form.dataset.initial || 'null');
    } catch {
      initial = null;
    }

    const statusId = form.dataset.statusId;
    const current = {
      name: String(form.querySelector('input[name="name"]')?.value || ''),
      slug: String(form.querySelector('input[name="slug"]')?.value || ''),
      sort_order: Number(form.querySelector('input[name="sort_order"]')?.value || 0) || 0,
      is_default_open: Boolean(form.querySelector('input[name="is_default_open"]')?.checked),
      is_closed: Boolean(form.querySelector('input[name="is_closed"]')?.checked),
    };

    const changed =
      !initial ||
      current.name !== initial.name ||
      current.slug !== initial.slug ||
      current.sort_order !== initial.sort_order ||
      current.is_default_open !== initial.is_default_open ||
      current.is_closed !== initial.is_closed;

    if (!changed) continue;

    await fetch(`/api/admin/statuses/${statusId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current),
    });
  }

  await loadStatuses();

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
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
  document.querySelector('[data-save-statuses]')?.addEventListener('click', handleSaveAll);
  loadStatuses();
});
