const PERMISSIONS = [
  { id: 'tickets.view', label: 'View tickets' },
  { id: 'tickets.reply', label: 'Reply to tickets' },
  { id: 'tickets.claim', label: 'Claim/unclaim tickets' },
  { id: 'tickets.assign', label: 'Assign tickets' },
  { id: 'tickets.status', label: 'Change ticket status' },
];

const renderPermissionButtons = (selected = []) => {
  return PERMISSIONS.map((perm) => {
    const isActive = selected.includes(perm.id);
    return `
      <button
        class="btn secondary perm-option ${isActive ? 'is-active' : ''}"
        type="button"
        data-permission-option
        data-permission-value="${perm.id}"
        aria-pressed="${isActive ? 'true' : 'false'}"
      >
        ${perm.label}
      </button>
    `;
  }).join('');
};

const createModal = (selected) => {
  return `
    <dialog class="modal" data-permissions-modal aria-hidden="true">
      <div class="modal-content">
        <div class="modal-header">
          <h4>Configure permissions</h4>
        </div>
        <div class="modal-body permission-grid">
          ${renderPermissionButtons(selected)}
        </div>
        <div class="modal-actions">
          <button class="btn secondary" type="button" data-modal-cancel>Cancel</button>
          <button class="btn" type="button" data-modal-apply>Apply</button>
        </div>
      </div>
    </dialog>
  `;
};

const renderRoles = (roles) => {
  const list = document.querySelector('[data-roles-list]');
  list.innerHTML = '';
  roles.forEach((role) => {
    const selected = [];
    try {
      const parsed = JSON.parse(role.permissions || '[]');
      if (Array.isArray(parsed)) selected.push(...parsed);
    } catch {
      if (role.permissions) {
        role.permissions.split(',').forEach((val) => selected.push(val.trim()));
      }
    }

    const form = document.createElement('form');
    form.className = 'form inline-form';
    form.innerHTML = `
      <input type="text" name="name" value="${role.name || ''}" required>
      <input type="hidden" name="permissions" value="${selected.join(', ')}">
      <div class="permissions-row">
        <button class="btn secondary" type="button" data-permissions-button>Configure Permissions</button>
        <span class="muted" data-permissions-summary>${selected.length ? `${selected.length} selected` : 'None selected'}</span>
      </div>
      <label class="checkbox">
        <input type="checkbox" name="is_admin" value="1" ${role.is_admin ? 'checked' : ''}>
        Admin
      </label>
      <button class="btn secondary" type="submit">Update</button>
      ${createModal(selected)}
    `;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const permissions = String(formData.get('permissions') || '')
        .split(',')
        .map((val) => val.trim())
        .filter(Boolean);
      await fetch(`/api/admin/roles/${role.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          permissions,
          is_admin: formData.get('is_admin') === '1',
        }),
      });
      loadRoles();
    });

    list.appendChild(form);
  });
};

const loadRoles = async () => {
  const res = await fetch('/api/admin/roles');
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  renderRoles(data.roles || []);
};

const handleCreate = async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const permissions = String(formData.get('permissions') || '')
    .split(',')
    .map((val) => val.trim())
    .filter(Boolean);
  await fetch('/api/admin/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: formData.get('name'),
      permissions,
      is_admin: formData.get('is_admin') === '1',
    }),
  });
  form.reset();
  loadRoles();
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-create-role]').addEventListener('submit', handleCreate);
  const newPerms = document.querySelector('[data-new-permissions]');
  if (newPerms) {
    newPerms.innerHTML = renderPermissionButtons([]);
  }
  loadRoles();
});
