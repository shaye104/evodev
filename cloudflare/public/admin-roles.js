const TICKET_PERMISSIONS = [
  { id: 'tickets.view', label: 'View tickets' },
  { id: 'tickets.reply', label: 'Reply to tickets' },
  { id: 'tickets.claim', label: 'Claim/unclaim tickets' },
  { id: 'tickets.assign', label: 'Assign tickets' },
  { id: 'tickets.status', label: 'Change ticket status' },
  { id: 'tickets.escalate', label: 'Escalate/move tickets' },
  { id: 'tickets.subject', label: 'Edit ticket subject' },
];

const ADMIN_PERMISSIONS = [
  { id: 'admin.panels', label: 'Panels' },
  { id: 'admin.statuses', label: 'Statuses' },
  { id: 'admin.staff', label: 'Staff' },
  { id: 'admin.roles', label: 'Roles' },
  { id: 'admin.audit', label: 'Audit log' },
  { id: 'staff.manage_pay', label: 'Manage pay' },
];

const clamp255 = (n) => Math.max(0, Math.min(255, Number(n) || 0));

const normalizeHex = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;

  // Allow rgb(r,g,b) input in the hex box for convenience.
  const rgb = s.match(/^rgb\\s*\\(\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*\\)$/i);
  if (rgb) {
    const r = clamp255(rgb[1]);
    const g = clamp255(rgb[2]);
    const b = clamp255(rgb[3]);
    return (
      '#' +
      [r, g, b]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
    );
  }

  const h = s.startsWith('#') ? s.slice(1) : s;
  if (/^[0-9a-f]{3}$/.test(h)) {
    return (
      '#' +
      h
        .split('')
        .map((c) => c + c)
        .join('')
    );
  }
  if (/^[0-9a-f]{6}$/.test(h)) return `#${h}`;
  return null;
};

const hexToRgb = (hex) => {
  const h = normalizeHex(hex);
  if (!h) return null;
  const x = h.slice(1);
  return {
    r: parseInt(x.slice(0, 2), 16),
    g: parseInt(x.slice(2, 4), 16),
    b: parseInt(x.slice(4, 6), 16),
  };
};

const rgbToHex = (r, g, b) =>
  '#' +
  [clamp255(r), clamp255(g), clamp255(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

const setupColorTools = (root, fieldName, onChange) => {
  const container = root?.querySelector?.(`[data-color-tools="${fieldName}"]`);
  if (!container) return null;

  const picker = container.querySelector(`input[name="${fieldName}"]`);
  const hexInput = container.querySelector('[data-color-hex]');
  const rInput = container.querySelector('[data-color-r]');
  const gInput = container.querySelector('[data-color-g]');
  const bInput = container.querySelector('[data-color-b]');
  if (!picker || !hexInput || !rInput || !gInput || !bInput) return null;

  const applyHex = (nextHex) => {
    const h = normalizeHex(nextHex);
    if (!h) return false;
    picker.value = h;
    hexInput.value = h;
    const rgb = hexToRgb(h);
    if (rgb) {
      rInput.value = String(rgb.r);
      gInput.value = String(rgb.g);
      bInput.value = String(rgb.b);
    }
    if (typeof onChange === 'function') onChange();
    return true;
  };

  // Allow callers to re-sync after form.reset().
  container.__applyHex = applyHex;

  // Initialize from picker value.
  applyHex(picker.value);

  picker.addEventListener('input', () => applyHex(picker.value));

  const onHexEdit = () => {
    const ok = applyHex(hexInput.value);
    if (ok) hexInput.classList.remove('is-invalid');
    else hexInput.classList.add('is-invalid');
  };
  hexInput.addEventListener('input', onHexEdit);
  hexInput.addEventListener('blur', onHexEdit);

  const onRgbEdit = () => {
    const h = rgbToHex(rInput.value, gInput.value, bInput.value);
    applyHex(h);
  };
  rInput.addEventListener('input', onRgbEdit);
  gInput.addEventListener('input', onRgbEdit);
  bInput.addEventListener('input', onRgbEdit);

  return { applyHex };
};

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
      <span class="hint-icon" tabindex="0" data-hint="Warning: Admins can access all panels and tickets regardless of panel visibility rules."></span>
    </div>
  `;
};

const renderPermissionButtons = (permissionDefs, selected = []) => {
  return permissionDefs.map((perm) => {
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
            ${renderPermissionButtons(TICKET_PERMISSIONS, selected)}
          </div>

          <div style="margin-top: 14px;">
            <div class="subheading">Admin</div>
            <div class="permission-grid" style="margin-top: 10px;">
              ${renderPermissionButtons(ADMIN_PERMISSIONS, selected)}
            </div>
            <div style="margin-top: 12px;">
              ${renderAdminToggle(isAdmin)}
            </div>
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
    form.className = 'form role-form';
    const bg = role.color_bg || '#3484ff';
    const text = role.color_text || '#ffffff';
    const deleteBtnClass = isAdminRole ? 'btn secondary small' : 'btn danger small';
    const deleteBtnDisabled = isAdminRole ? 'disabled' : '';
    const deleteBtnTitle = isAdminRole ? 'Admin role cannot be deleted.' : 'Delete role';
    form.innerHTML = `
      <div class="role-name-row">
        <input type="text" name="name" value="${role.name || ''}" required>
        <span class="role-pill role-staff" data-role-preview>Preview</span>
      </div>
      <div class="role-color-row">
        <div class="color-block" data-color-tools="color_bg">
          <div class="color-block-title">Badge background</div>
          <div class="color-tools">
            <input type="color" name="color_bg" value="${bg}" aria-label="Badge background color">
            <input type="text" class="mono" data-color-hex value="${bg}" placeholder="#RRGGBB" spellcheck="false" autocapitalize="off" inputmode="text" aria-label="Badge background hex">
            <div class="rgb-row" aria-label="Badge background RGB">
              <input type="number" min="0" max="255" step="1" data-color-r placeholder="R" aria-label="Red">
              <input type="number" min="0" max="255" step="1" data-color-g placeholder="G" aria-label="Green">
              <input type="number" min="0" max="255" step="1" data-color-b placeholder="B" aria-label="Blue">
            </div>
          </div>
        </div>
        <div class="color-block" data-color-tools="color_text">
          <div class="color-block-title">Badge text</div>
          <div class="color-tools">
            <input type="color" name="color_text" value="${text}" aria-label="Badge text color">
            <input type="text" class="mono" data-color-hex value="${text}" placeholder="#RRGGBB" spellcheck="false" autocapitalize="off" inputmode="text" aria-label="Badge text hex">
            <div class="rgb-row" aria-label="Badge text RGB">
              <input type="number" min="0" max="255" step="1" data-color-r placeholder="R" aria-label="Red">
              <input type="number" min="0" max="255" step="1" data-color-g placeholder="G" aria-label="Green">
              <input type="number" min="0" max="255" step="1" data-color-b placeholder="B" aria-label="Blue">
            </div>
          </div>
        </div>
      </div>
      <input type="hidden" name="permissions" value="${selected.join(', ')}">
      <input type="hidden" name="is_admin" value="${role.is_admin ? '1' : '0'}">
      <div class="role-form-actions">
        <div class="permissions-row">
          <button class="btn secondary" type="button" data-permissions-button>Configure Permissions</button>
        </div>
        <div class="inline">
          <button class="btn secondary small" type="submit">Update</button>
          <button class="${deleteBtnClass}" type="button" data-delete-role ${deleteBtnDisabled} title="${deleteBtnTitle}">
            Delete
          </button>
        </div>
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
    setupColorTools(form, 'color_bg', updatePreview);
    setupColorTools(form, 'color_text', updatePreview);
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
  try {
    form.querySelector('[data-color-tools="color_bg"]')?.__applyHex?.(
      form.querySelector('input[name="color_bg"]')?.value
    );
    form.querySelector('[data-color-tools="color_text"]')?.__applyHex?.(
      form.querySelector('input[name="color_text"]')?.value
    );
  } catch {}
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
  const newTicketPerms = document.querySelector('[data-new-ticket-permissions]');
  if (newTicketPerms) newTicketPerms.innerHTML = renderPermissionButtons(TICKET_PERMISSIONS, []);
  const newAdminPerms = document.querySelector('[data-new-admin-permissions]');
  if (newAdminPerms) newAdminPerms.innerHTML = renderPermissionButtons(ADMIN_PERMISSIONS, []);
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
    setupColorTools(createForm, 'color_bg', updatePreview);
    setupColorTools(createForm, 'color_text', updatePreview);
    updatePreview();
  }
  loadRoles();
});
