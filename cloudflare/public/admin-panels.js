const renderRoleOptions = (roles = [], selected = []) => {
  return roles
    .map((role) => {
      const id = String(role.id);
      const isActive = selected.includes(id);
      const bg = String(role.color_bg || '').trim();
      const text = String(role.color_text || '').trim() || '#ffffff';
      const style = bg ? ` style="--role-bg:${bg};--role-text:${text};"` : '';
      const coloredClass = bg ? 'role-colored' : '';
      return `
        <button
          class="btn secondary perm-option ${coloredClass} ${isActive ? 'is-active' : ''}"
          type="button"
          data-permission-option
          data-permission-value="${id}"
          aria-pressed="${isActive ? 'true' : 'false'}"
          ${style}
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

const syncActiveToggle = (form) => {
  const hidden = form.querySelector('input[name="is_active"]');
  const btn = form.querySelector('[data-active-toggle]');
  if (!hidden || !btn) return;
  const isActive = String(hidden.value || '0') === '1';
  btn.textContent = isActive ? 'Deactivate' : 'Activate';
  btn.classList.toggle('danger', isActive);
  btn.classList.toggle('success', !isActive);
  btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
};

const bindActiveToggle = (form) => {
  if (!form) return;
  const btn = form.querySelector('[data-active-toggle]');
  const hidden = form.querySelector('input[name="is_active"]');
  if (!btn || !hidden) return;
  btn.addEventListener('click', () => {
    const isActive = String(hidden.value || '0') === '1';
    hidden.value = isActive ? '0' : '1';
    syncActiveToggle(form);
  });
  syncActiveToggle(form);
};

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
      </div>
      <input type="hidden" name="is_active" value="${panel.is_active ? '1' : '0'}">
      <div class="permissions-row">
        <button class="btn ${panel.is_active ? 'danger' : 'success'}" type="button" data-active-toggle aria-pressed="${panel.is_active ? 'true' : 'false'}">
          ${panel.is_active ? 'Deactivate' : 'Activate'}
        </button>
        <span class="hint-icon" tabindex="0" data-hint="A deactivated panel is hidden for users when creating a new ticket."></span>
      </div>
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
    bindActiveToggle(form);
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
          is_active: String(formData.get('is_active') || '') === '1',
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
      // Panels start deactivated. Activate them from the "Existing panels" section.
      is_active: false,
      allowed_role_ids: parseIds(formData.get('allowed_role_ids')).map((v) => Number(v || 0)).filter(Boolean),
    }),
  });
  form.reset();
  const hidden = form.querySelector('input[name="allowed_role_ids"]');
  if (hidden) hidden.value = '';
  loadPanels();
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-create-panel]').addEventListener('submit', handleCreate);
  loadPanels();
});
