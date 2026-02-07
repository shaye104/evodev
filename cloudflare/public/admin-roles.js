const PERMISSIONS = [
  { id: 'tickets.view', label: 'View tickets' },
  { id: 'tickets.reply', label: 'Reply to tickets' },
  { id: 'tickets.claim', label: 'Claim/unclaim tickets' },
  { id: 'tickets.assign', label: 'Assign tickets' },
  { id: 'tickets.status', label: 'Change ticket status' },
  { id: 'tickets.escalate', label: 'Escalate/move tickets' },
  { id: 'tickets.subject', label: 'Edit ticket subject' },
];

const renderAdminToggle = (isAdmin) => {
  const on = Boolean(isAdmin);
  return `
    <div class="permissions-row" style="align-items: flex-start;">
      <button
        class="btn warning ${on ? '' : 'secondary'}"
        type="button"
        data-admin-toggle
        aria-pressed="${on ? 'true' : 'false'}"
      >
        Admin access: ${on ? 'ON' : 'OFF'}
      </button>
      <span class="muted">Warning: Admins can access all panels and tickets regardless of panel visibility rules.</span>
    </div>
  `;
};

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

const createModal = (selected, isAdmin) => {
  return `
    <dialog class="modal" data-permissions-modal aria-hidden="true">
      <div class="modal-content">
        <div class="modal-header">
          <h4>Configure permissions</h4>
        </div>
        <div class="modal-body">
          <div class="permission-grid">
            ${renderPermissionButtons(selected)}
          </div>
          <div style="margin-top: 12px;">
            ${renderAdminToggle(isAdmin)}
          </div>
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
    const isAdminRole =
      Boolean(role.is_admin) || String(role.name || '').trim().toLowerCase() === 'admin';

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
    const bg = role.color_bg || '#3484ff';
    const text = role.color_text || '#ffffff';
    const deleteBtnClass = isAdminRole ? 'btn secondary small' : 'btn danger small';
    const deleteBtnDisabled = isAdminRole ? 'disabled' : '';
    const deleteBtnTitle = isAdminRole ? 'Admin role cannot be deleted.' : 'Delete role';
    form.innerHTML = `
      <input type="text" name="name" value="${role.name || ''}" required>
      <div class="inline">
        <label>
          Badge background
          <input type="color" name="color_bg" value="${bg}">
        </label>
        <label>
          Badge text
          <input type="color" name="color_text" value="${text}">
        </label>
        <span class="role-pill role-staff" data-role-preview>Preview</span>
      </div>
      <input type="hidden" name="permissions" value="${selected.join(', ')}">
      <input type="hidden" name="is_admin" value="${role.is_admin ? '1' : '0'}">
      <div class="permissions-row">
        <button class="btn secondary" type="button" data-permissions-button>Configure Permissions</button>
        <span class="muted" data-permissions-summary>${selected.length ? `${selected.length} selected` : 'None selected'}</span>
      </div>
      <div class="inline">
        <button class="btn secondary small" type="submit">Update</button>
        <button class="${deleteBtnClass}" type="button" data-delete-role ${deleteBtnDisabled} title="${deleteBtnTitle}">
          Delete
        </button>
      </div>
      ${createModal(selected, role.is_admin)}
    `;

    const updatePreview = () => {
      const nameVal = String(form.querySelector('input[name="name"]').value || '').trim();
      const bgVal = String(form.querySelector('input[name="color_bg"]').value || '').trim();
      const textVal = String(form.querySelector('input[name="color_text"]').value || '').trim();
      const preview = form.querySelector('[data-role-preview]');
      preview.textContent = nameVal || 'Preview';
      preview.style.backgroundColor = bgVal || '#3484ff';
      preview.style.borderColor = bgVal || '#3484ff';
      preview.style.color = textVal || '#ffffff';
    };
    form.querySelector('input[name="name"]').addEventListener('input', updatePreview);
    form.querySelector('input[name="color_bg"]').addEventListener('input', updatePreview);
    form.querySelector('input[name="color_text"]').addEventListener('input', updatePreview);
    updatePreview();

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
          is_admin: String(formData.get('is_admin') || '') === '1',
          color_bg: formData.get('color_bg'),
          color_text: formData.get('color_text'),
        }),
      });
      loadRoles();
    });

    form.querySelector('[data-delete-role]')?.addEventListener('click', async () => {
      const name = String(form.querySelector('input[name="name"]')?.value || role.name || 'this role');
      if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

      const res = await fetch(`/api/admin/roles/${role.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to delete role');
        return;
      }
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
      is_admin: String(formData.get('is_admin') || '') === '1',
      color_bg: formData.get('color_bg'),
      color_text: formData.get('color_text'),
    }),
  });
  form.reset();
  const bgVal = String(form.querySelector('input[name="color_bg"]')?.value || '').trim();
  const textVal = String(form.querySelector('input[name="color_text"]')?.value || '').trim();
  const preview = form.querySelector('[data-role-preview]');
  if (preview) {
    preview.style.backgroundColor = bgVal || '#3484ff';
    preview.style.borderColor = bgVal || '#3484ff';
    preview.style.color = textVal || '#ffffff';
  }
  loadRoles();
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-create-role]').addEventListener('submit', handleCreate);
  const newPerms = document.querySelector('[data-new-permissions]');
  if (newPerms) {
    newPerms.innerHTML = renderPermissionButtons([]);
  }
  const createForm = document.querySelector('[data-create-role]');
  if (createForm) {
    const updatePreview = () => {
      const nameVal = String(createForm.querySelector('input[name="name"]').value || '').trim();
      const bgVal = String(createForm.querySelector('input[name="color_bg"]').value || '').trim();
      const textVal = String(createForm.querySelector('input[name="color_text"]').value || '').trim();
      const preview = createForm.querySelector('[data-role-preview]');
      preview.textContent = nameVal || 'Preview';
      preview.style.backgroundColor = bgVal || '#3484ff';
      preview.style.borderColor = bgVal || '#3484ff';
      preview.style.color = textVal || '#ffffff';
    };
    createForm.querySelector('input[name="name"]').addEventListener('input', updatePreview);
    createForm.querySelector('input[name="color_bg"]').addEventListener('input', updatePreview);
    createForm.querySelector('input[name="color_text"]').addEventListener('input', updatePreview);
    updatePreview();
  }
  loadRoles();
});
