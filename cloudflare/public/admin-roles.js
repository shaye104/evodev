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

const openDialog = (modal) => {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'false');
  try {
    if (typeof modal.showModal === 'function') modal.showModal();
    else throw new Error('showModal not supported');
  } catch {
    // Safari/older browsers can have partial <dialog> support where showModal exists but throws.
    modal.setAttribute('open', '');
    modal.classList.add('open');
  }
};

const closeDialog = (modal) => {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  try {
    if (typeof modal.close === 'function') modal.close();
    else throw new Error('close not supported');
  } catch {
    modal.removeAttribute('open');
    modal.classList.remove('open');
  }
};

const wireColorModal = (form, updatePreview) => {
  const btn = form.querySelector('[data-color-trigger]');
  const modal = form.querySelector('[data-colors-modal]');
  if (!btn || !modal) return;

  const getVals = () => ({
    bg: String(form.querySelector('input[name="color_bg"]')?.value || '').trim() || '#3484ff',
    text: String(form.querySelector('input[name="color_text"]')?.value || '').trim() || '#ffffff',
  });

  const revertTo = (vals) => {
    form.querySelector('[data-color-tools="color_bg"]')?.__applyHex?.(vals.bg);
    form.querySelector('[data-color-tools="color_text"]')?.__applyHex?.(vals.text);
    if (typeof updatePreview === 'function') updatePreview();
  };

  btn.addEventListener('click', () => {
    const { bg, text } = getVals();
    modal.dataset.initialBg = bg;
    modal.dataset.initialText = text;
    // Ensure tool UIs are synced before showing.
    revertTo({ bg, text });
    openDialog(modal);
  });

  const onCancel = () => {
    const bg = modal.dataset.initialBg || '#3484ff';
    const text = modal.dataset.initialText || '#ffffff';
    revertTo({ bg, text });
    closeDialog(modal);
  };

  const onApply = () => {
    const { bg, text } = getVals();
    modal.dataset.initialBg = bg;
    modal.dataset.initialText = text;
    closeDialog(modal);
  };

  modal.querySelector('[data-colors-cancel]')?.addEventListener('click', onCancel);
  modal.querySelector('[data-colors-apply]')?.addEventListener('click', onApply);

  // Treat backdrop click / Esc as cancel.
  modal.addEventListener('click', (e) => {
    if (e.target === modal) onCancel();
  });
  modal.addEventListener('cancel', (e) => {
    e.preventDefault();
    onCancel();
  });
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
    form.dataset.roleId = String(role.id);
    const bg = role.color_bg || '#3484ff';
    const text = role.color_text || '#ffffff';
    const deleteBtnClass = isAdminRole ? 'btn secondary small' : 'btn danger small';
    const deleteBtnDisabled = isAdminRole ? 'disabled' : '';
    const deleteBtnTitle = isAdminRole ? 'Admin role cannot be deleted.' : 'Delete role';
    form.innerHTML = `
      <div class="role-main">
        <input type="text" name="name" value="${role.name || ''}" required>
        <button
          class="role-pill role-staff role-pill-button"
          type="button"
          data-role-preview
          data-color-trigger
          title="Edit badge colours"
        >Preview</button>
      </div>
      <div class="role-actions">
        <button class="btn secondary small" type="button" data-permissions-button>Permissions</button>
        <button class="${deleteBtnClass}" type="button" data-delete-role ${deleteBtnDisabled} title="${deleteBtnTitle}">Delete</button>
      </div>
      <input type="hidden" name="permissions" value="${selected.join(', ')}">
      <input type="hidden" name="is_admin" value="${role.is_admin ? '1' : '0'}">

      <dialog class="modal" data-colors-modal aria-hidden="true">
        <div class="modal-content">
          <div class="modal-header">
            <h4>Badge colours</h4>
          </div>
          <div class="modal-body">
            <div class="permissions-row" style="justify-content: space-between;">
              <span class="muted">Preview</span>
              <span class="role-pill role-staff" data-role-color-preview>Preview</span>
            </div>

            <div class="color-block" data-color-tools="color_bg">
              <div class="color-block-title">Badge background</div>
              <div class="color-tools">
                <input type="color" name="color_bg" value="${bg}" aria-label="Badge background color">
                <input type="text" class="mono" name="color_bg_hex" data-color-hex value="${bg}" placeholder="#RRGGBB" spellcheck="false" autocapitalize="off" inputmode="text" aria-label="Badge background hex">
                <div class="rgb-row" aria-label="Badge background RGB">
                  <input type="number" name="color_bg_r" min="0" max="255" step="1" data-color-r placeholder="R" aria-label="Red">
                  <input type="number" name="color_bg_g" min="0" max="255" step="1" data-color-g placeholder="G" aria-label="Green">
                  <input type="number" name="color_bg_b" min="0" max="255" step="1" data-color-b placeholder="B" aria-label="Blue">
                </div>
              </div>
            </div>

            <div class="color-block" data-color-tools="color_text" style="margin-top: 8px;">
              <div class="color-block-title">Badge text</div>
              <div class="color-tools">
                <input type="color" name="color_text" value="${text}" aria-label="Badge text color">
                <input type="text" class="mono" name="color_text_hex" data-color-hex value="${text}" placeholder="#RRGGBB" spellcheck="false" autocapitalize="off" inputmode="text" aria-label="Badge text hex">
                <div class="rgb-row" aria-label="Badge text RGB">
                  <input type="number" name="color_text_r" min="0" max="255" step="1" data-color-r placeholder="R" aria-label="Red">
                  <input type="number" name="color_text_g" min="0" max="255" step="1" data-color-g placeholder="G" aria-label="Green">
                  <input type="number" name="color_text_b" min="0" max="255" step="1" data-color-b placeholder="B" aria-label="Blue">
                </div>
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn secondary" type="button" data-colors-cancel>Cancel</button>
            <button class="btn" type="button" data-colors-apply>Apply</button>
          </div>
        </div>
      </dialog>
      ${createModal(selected, role.is_admin)}
    `;

    form.dataset.initial = JSON.stringify({
      name: String(role.name || ''),
      permissions: selected.slice().sort(),
      is_admin: Boolean(role.is_admin),
      color_bg: String(bg || ''),
      color_text: String(text || ''),
    });

    const updatePreview = () => {
      const nameVal = String(form.querySelector('input[name="name"]').value || '').trim();
      const bgVal = String(form.querySelector('input[name="color_bg"]').value || '').trim();
      const textVal = String(form.querySelector('input[name="color_text"]').value || '').trim();
      const previews = [
        form.querySelector('[data-role-preview]'),
        form.querySelector('[data-role-color-preview]'),
      ].filter(Boolean);

      previews.forEach((preview) => {
        preview.textContent = nameVal || 'Preview';
        preview.style.backgroundColor = bgVal || '#3484ff';
        preview.style.borderColor = bgVal || '#3484ff';
        preview.style.color = textVal || '#ffffff';
      });
    };
    form.querySelector('input[name="name"]').addEventListener('input', updatePreview);
    setupColorTools(form, 'color_bg', updatePreview);
    setupColorTools(form, 'color_text', updatePreview);
    updatePreview();
    wireColorModal(form, updatePreview);

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

const handleSaveAll = async () => {
  const btn = document.querySelector('[data-save-roles]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  const forms = Array.from(document.querySelectorAll('[data-roles-list] form'));
  for (const form of forms) {
    if (!form.reportValidity()) continue;

    let initial = null;
    try {
      initial = JSON.parse(form.dataset.initial || 'null');
    } catch {
      initial = null;
    }

    const roleId = form.dataset.roleId;
    const name = String(form.querySelector('input[name="name"]')?.value || '').trim();
    const isAdmin = String(form.querySelector('input[name="is_admin"]')?.value || '0') === '1';
    const bg = String(form.querySelector('input[name="color_bg"]')?.value || '').trim();
    const text = String(form.querySelector('input[name="color_text"]')?.value || '').trim();
    const permissions = String(form.querySelector('input[name="permissions"]')?.value || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const sortedPerms = permissions.slice().sort();

    const changed =
      !initial ||
      name !== initial.name ||
      isAdmin !== initial.is_admin ||
      bg !== initial.color_bg ||
      text !== initial.color_text ||
      JSON.stringify(sortedPerms) !== JSON.stringify((initial.permissions || []).slice().sort());

    if (!changed) continue;

    await fetch(`/api/admin/roles/${roleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        permissions,
        is_admin: isAdmin,
        color_bg: bg,
        color_text: text,
      }),
    });
  }

  await loadRoles();
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
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
  document.querySelector('[data-save-roles]')?.addEventListener('click', handleSaveAll);
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
      const previews = [
        createForm.querySelector('[data-role-preview]'),
        createForm.querySelector('[data-role-color-preview]'),
      ].filter(Boolean);
      previews.forEach((preview) => {
        preview.textContent = nameVal || 'Preview';
        preview.style.backgroundColor = bgVal || '#3484ff';
        preview.style.borderColor = bgVal || '#3484ff';
        preview.style.color = textVal || '#ffffff';
      });
    };
    createForm.querySelector('input[name="name"]').addEventListener('input', updatePreview);
    setupColorTools(createForm, 'color_bg', updatePreview);
    setupColorTools(createForm, 'color_text', updatePreview);
    updatePreview();
    wireColorModal(createForm, updatePreview);
  }
  loadRoles();
});
