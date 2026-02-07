const renderRoleOptions = (roles = [], selected = []) => {
  return roles
    .map((role) => {
      const id = String(role.id);
      const isActive = selected.includes(id);
      return `
        <button
          class="btn secondary perm-option ${isActive ? 'is-active' : ''}"
          type="button"
          data-permission-option
          data-permission-value="${id}"
          aria-pressed="${isActive ? 'true' : 'false'}"
        >
          ${role.name}${role.is_admin ? ' (Admin)' : ''}
        </button>
      `;
    })
    .join('');
};

const parseIds = (raw) =>
  String(raw || '')
    .split(',')
    .map((val) => val.trim())
    .filter(Boolean);

const loadPanels = async () => {
  const res = await fetch('/api/admin/panels');
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  const roles = data.roles || [];
  const accessRows = data.panel_role_access || [];

  const newRolesGrid = document.querySelector('[data-panel-roles-grid]');
  if (newRolesGrid) {
    newRolesGrid.innerHTML = renderRoleOptions(roles, []);
  }

  const container = document.querySelector('[data-panels-list]');
  container.innerHTML = '';
  data.panels.forEach((panel) => {
    const selected = accessRows
      .filter((row) => String(row.panel_id) === String(panel.id))
      .map((row) => String(row.role_id));
    const form = document.createElement('form');
    form.className = 'form inline-form';
    form.innerHTML = `
      <input type="text" name="name" value="${panel.name || ''}" required>
      <input type="text" name="description" value="${panel.description || ''}">
      <input type="number" name="sort_order" value="${panel.sort_order || 0}">
      <input type="hidden" name="allowed_role_ids" value="${selected.join(', ')}">
      <div class="permissions-row">
        <button class="btn secondary" type="button" data-permissions-button>Visibility</button>
        <span class="muted" data-permissions-summary>${
          selected.length ? `Restricted: ${selected.length} role(s)` : 'All staff'
        }</span>
      </div>
      <label class="checkbox">
        <input type="checkbox" name="is_active" value="1" ${panel.is_active ? 'checked' : ''}>
        Active
      </label>
      <button class="btn secondary" type="submit">Update</button>
      <dialog
        class="modal"
        data-permissions-modal
        data-target-input="allowed_role_ids"
        data-empty-label="All staff"
        data-selected-label="Restricted: {n} role(s)"
        aria-hidden="true"
      >
        <div class="modal-content">
          <div class="modal-header">
            <h4>Panel visibility (staff)</h4>
          </div>
          <div class="modal-body permission-grid">
            ${renderRoleOptions(roles, selected)}
          </div>
          <div class="modal-actions">
            <button class="btn secondary" type="button" data-modal-cancel>Cancel</button>
            <button class="btn" type="button" data-modal-apply>Apply</button>
          </div>
        </div>
      </dialog>
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
          allowed_role_ids: parseIds(formData.get('allowed_role_ids')).map((v) => Number(v || 0)).filter(Boolean),
        }),
      });
      loadPanels();
    });
    container.appendChild(form);
  });
};

const handleCreate = async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  await fetch('/api/admin/panels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: formData.get('name'),
      description: formData.get('description'),
      sort_order: Number(formData.get('sort_order') || 0),
      is_active: formData.get('is_active') === '1',
      allowed_role_ids: parseIds(formData.get('allowed_role_ids')).map((v) => Number(v || 0)).filter(Boolean),
    }),
  });
  form.reset();
  const hidden = form.querySelector('input[name="allowed_role_ids"]');
  const summary = form.querySelector('[data-permissions-summary]');
  if (hidden) hidden.value = '';
  if (summary) summary.textContent = 'All staff';
  loadPanels();
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-create-panel]').addEventListener('submit', handleCreate);
  loadPanels();
});
