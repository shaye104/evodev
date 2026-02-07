const parsePermissions = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return [];
  }
};

const staffHasPermission = (staff, perm) => {
  if (!staff) return false;
  if (staff.is_admin) return true;
  const perms = parsePermissions(staff.permissions);
  if (perms.includes('*')) return true;
  return perms.includes(perm);
};

const toPos = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? x : 999999;
};

const getActorPos = (staff) => {
  if (!staff) return 999999;
  if (staff.is_admin) return -1;
  return toPos(staff.role_sort_order ?? staff.role_sort ?? staff.sort_order ?? 999999);
};

const openModal = (modal) => {
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

const closeModal = (modal) => {
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

const state = {
  me: null,
  canManagePay: false,
  canManageStaff: false,
};

const loadStaff = async () => {
  const res = await fetch('/api/admin/staff');
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  state.me = data.me || null;
  state.canManagePay = staffHasPermission(state.me, 'staff.manage_pay');
  state.canManageStaff = staffHasPermission(state.me, 'admin.staff');
  const actorPos = getActorPos(state.me);
  const list = document.querySelector('[data-staff-list]');
  list.innerHTML = '';

  const canManagePay = state.canManagePay;
  const canManageStaff = state.canManageStaff;
  const createForm = document.querySelector('[data-create-staff]');
  const disableCreate = Boolean(createForm && !canManageStaff && !state.me?.is_admin);
  if (createForm) {
    createForm.querySelectorAll('input, select, button').forEach((el) => {
      if (el.type === 'hidden') return;
      el.disabled = disableCreate || el.disabled;
    });
  }
  const createPayInput = document.querySelector('[data-create-staff] input[name="pay_per_ticket"]');
  if (createPayInput) {
    createPayInput.disabled = disableCreate || !canManagePay;
    if (!canManagePay) createPayInput.value = '0';
  }

  data.staff.forEach((member) => {
    const isSuspended = !member.is_active;
    const memberPos = toPos(member.role_sort_order ?? 999999);
    const memberIsAdmin = Boolean(member.is_admin);
    const canManageMember = Boolean(
      state.me &&
        (state.me.is_admin || (!memberIsAdmin && actorPos < memberPos))
    );

    const row = document.createElement('div');
    row.className = 'inline-form';
    const options = data.roles
      .map(
        (role) => {
          const rolePos = toPos(role.sort_order ?? 999999);
          const isSelected = String(role.id) === String(member.role_id);
          const disabled =
            !canManageStaff ||
            !canManageMember ||
            (!state.me?.is_admin && (Boolean(role.is_admin) || !(actorPos < rolePos)));
          return `<option value="${role.id}" ${isSelected ? 'selected' : ''} ${
            disabled && !isSelected ? 'disabled' : ''
          }>${role.name}</option>`;
        }
      )
      .join('');
    const displayName = member.nickname || member.discord_username || member.discord_id;
    const roleName = member.role_name || (member.is_admin ? 'Admin' : 'Staff');
    const roleBg = String(member.color_bg || '').trim();
    const roleText = String(member.color_text || '').trim() || '#ffffff';
    const roleStyle = roleBg
      ? `style="background:${roleBg};border-color:${roleBg};color:${roleText};"`
      : '';
    const roleClass = member.is_admin ? 'role-admin' : 'role-staff';
	    const pay = Number(member.pay_per_ticket || 0) || 0;

      const payField = canManagePay
        ? `
          <label>
            <span class="label-row">
              <span>Pay per ticket (R$)</span>
              <span class="hint-icon" tabindex="0" data-hint="Used for the staff dashboard earnings tracker. Changes notify the staff member."></span>
            </span>
            <input type="number" name="pay_per_ticket" min="0" step="1" value="${pay}" placeholder="0" ${
              !canManageMember ? 'disabled' : ''
            }>
          </label>
        `
        : `
          <label>
            <span class="label-row">
              <span>Pay per ticket (R$)</span>
              <span class="hint-icon" tabindex="0" data-hint="Requires the Manage pay permission."></span>
            </span>
            <input type="number" name="pay_per_ticket" min="0" step="1" value="${pay}" placeholder="0" disabled>
          </label>
        `;

      const nicknameField = `
        <label>
          <span class="label-row">
            <span>Nickname (optional)</span>
            <span class="hint-icon" tabindex="0" data-hint="Shown in staff views. Leave empty to use their Discord username."></span>
          </span>
          <input type="text" name="nickname" value="${member.nickname || ''}" placeholder="Optional display name" autocomplete="off" ${
            !canManageStaff || !canManageMember ? 'disabled' : ''
          }>
        </label>
      `;

	    row.innerHTML = `
	      <span>
	        ${displayName}
	        ${isSuspended ? '<span class="pill warning" style="margin-left:8px;">Suspended</span>' : ''}
	      </span>
	      <span class="role-pill ${roleClass}" ${roleStyle}>${roleName}</span>
	      <span class="pill">Pay: R$${pay}</span>
	      <button class="btn secondary" type="button" data-manage-user ${!canManageMember ? 'disabled' : ''}>Manage user</button>
	      ${
          canManagePay
            ? `<button class="btn secondary" type="button" data-open-bonus ${
                !canManageMember ? 'disabled' : ''
              }>Give bonus</button>`
            : ''
        }
	      ${
          canManagePay
            ? `<button class="btn secondary" type="button" data-open-dock ${
                !canManageMember ? 'disabled' : ''
              }>Dock pay</button>`
            : ''
        }

	      <dialog class="modal" data-manage-modal aria-hidden="true">
	        <div class="modal-content">
	          <div class="modal-header">
	            <h4>Manage user</h4>
	          </div>
	          <div class="modal-body">
	            <div class="form">
                ${nicknameField}
	              <label>
	                Role
	                <select name="role_id" data-role-select ${!canManageStaff || !canManageMember ? 'disabled' : ''}>${options}</select>
	              </label>
	              ${payField}
	            </div>

	            <div class="muted" style="margin-top: 12px;">Changes apply immediately.</div>
	          </div>
	          <div class="modal-actions" style="justify-content: space-between;">
              <div class="inline" style="margin: 0;">
	              <button class="btn warning" type="button" data-suspend-toggle ${!canManageStaff || !canManageMember ? 'disabled' : ''}>
	                ${isSuspended ? 'Unsuspend' : 'Suspend'}
	              </button>
	              <button class="btn danger" type="button" data-remove-user ${!canManageStaff || !canManageMember ? 'disabled' : ''}>Remove</button>
	            </div>
	            <div class="inline" style="margin: 0;">
	              <button class="btn secondary" type="button" data-modal-cancel>Close</button>
	              <button class="btn" type="button" data-save-settings ${!canManageMember ? 'disabled' : ''}>Save changes</button>
	            </div>
	          </div>
	        </div>
	      </dialog>

      ${
        canManagePay
          ? `
            <dialog class="modal" data-bonus-modal aria-hidden="true">
              <div class="modal-content">
                <div class="modal-header">
                  <h4>Give bonus</h4>
                </div>
                <div class="modal-body">
                  <div class="form">
                    <label>
                      Bonus amount (R$)
                      <span class="hint-icon" tabindex="0" data-hint="Adds a bonus to this staff member for the current month and sends a notification."></span>
                      <input type="number" name="bonus_amount" min="1" step="1" placeholder="0" required autocomplete="off">
                    </label>
                    <label>
                      Reason (optional)
                      <input type="text" name="bonus_reason" placeholder="e.g. Great performance" autocomplete="off">
                    </label>
                  </div>
                </div>
                <div class="modal-actions">
                  <button class="btn secondary" type="button" data-bonus-cancel>Cancel</button>
                  <button class="btn" type="button" data-bonus-submit>Give bonus</button>
                </div>
              </div>
            </dialog>
          `
          : ''
      }

      ${
        canManagePay
          ? `
            <dialog class="modal" data-dock-modal aria-hidden="true">
              <div class="modal-content">
                <div class="modal-header">
                  <h4>Dock pay</h4>
                </div>
                <div class="modal-body">
                  <div class="form">
                    <label>
                      Dock amount (R$)
                      <span class="hint-icon" tabindex="0" data-hint="Subtracts from this staff member's earnings for the current month and sends a notification."></span>
                      <input type="number" name="dock_amount" min="1" step="1" placeholder="0" required autocomplete="off">
                    </label>
                    <label>
                      Reason (optional)
                      <input type="text" name="dock_reason" placeholder="e.g. Missed requirements" autocomplete="off">
                    </label>
                  </div>
                </div>
                <div class="modal-actions">
                  <button class="btn secondary" type="button" data-dock-cancel>Cancel</button>
                  <button class="btn danger" type="button" data-dock-submit>Dock pay</button>
                </div>
              </div>
            </dialog>
          `
          : ''
      }
    `;

    const modal = row.querySelector('[data-manage-modal]');
    const openBtn = row.querySelector('[data-manage-user]');
    const closeBtn = row.querySelector('[data-modal-cancel]');
    const saveBtn = row.querySelector('[data-save-settings]');
    const suspendBtn = row.querySelector('[data-suspend-toggle]');
    const removeBtn = row.querySelector('[data-remove-user]');
    const bonusOpenBtn = row.querySelector('[data-open-bonus]');
    const bonusModal = row.querySelector('[data-bonus-modal]');
    const bonusCancelBtn = row.querySelector('[data-bonus-cancel]');
    const bonusSubmitBtn = row.querySelector('[data-bonus-submit]');
    const dockOpenBtn = row.querySelector('[data-open-dock]');
    const dockModal = row.querySelector('[data-dock-modal]');
    const dockCancelBtn = row.querySelector('[data-dock-cancel]');
    const dockSubmitBtn = row.querySelector('[data-dock-submit]');

    if (openBtn && !openBtn.disabled) openBtn.addEventListener('click', () => openModal(modal));
    if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal));
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
      });
    }
    if (bonusModal) {
      bonusModal.addEventListener('click', (e) => {
        if (e.target === bonusModal) closeModal(bonusModal);
      });
    }
    if (dockModal) {
      dockModal.addEventListener('click', (e) => {
        if (e.target === dockModal) closeModal(dockModal);
      });
    }

	    const getModalValues = () => {
	      const roleId = row.querySelector('[data-role-select]')?.value || member.role_id;
        const nicknameInput = row.querySelector('[data-manage-modal] input[name="nickname"]');
        const nickname = nicknameInput ? String(nicknameInput.value || '').trim() : String(member.nickname || '').trim();
	      const payInput = row.querySelector('[data-manage-modal] input[name="pay_per_ticket"]');
	      const payPerTicket = payInput ? Number(payInput.value || 0) || 0 : pay;
	      const includePay = Boolean(canManagePay && payInput && !payInput.disabled);
	      return { roleId, payPerTicket, includePay, nickname };
	    };

	    if (saveBtn) {
	      saveBtn.addEventListener('click', async () => {
	        saveBtn.disabled = true;
	        const { roleId, payPerTicket, includePay, nickname } = getModalValues();
          const payload = {};
          if (canManageStaff) {
            payload.role_id = roleId;
            payload.is_active = Boolean(member.is_active);
            payload.nickname = nickname;
          }
          if (includePay) payload.pay_per_ticket = payPerTicket;
	        const res = await fetch(`/api/admin/staff/${member.id}`, {
	          method: 'PUT',
	          headers: { 'Content-Type': 'application/json' },
	          body: JSON.stringify(payload),
	        });
	        saveBtn.disabled = false;
	        if (!res.ok) {
          const msg = await res.json().catch(() => ({}));
          alert(msg.error || 'Failed to save changes');
          return;
        }
        closeModal(modal);
        loadStaff();
      });
    }

	    if (suspendBtn) {
	      suspendBtn.addEventListener('click', async () => {
	        suspendBtn.disabled = true;
	        const { roleId, payPerTicket, includePay, nickname } = getModalValues();
	        const nextActive = isSuspended; // if currently suspended => unsuspend => true
          const payload = {};
          if (canManageStaff) {
            payload.role_id = roleId;
            payload.is_active = nextActive;
            payload.nickname = nickname;
          }
          if (includePay) payload.pay_per_ticket = payPerTicket;
	        const res = await fetch(`/api/admin/staff/${member.id}`, {
	          method: 'PUT',
	          headers: { 'Content-Type': 'application/json' },
	          body: JSON.stringify(payload),
	        });
	        suspendBtn.disabled = false;
	        if (!res.ok) {
          const msg = await res.json().catch(() => ({}));
          alert(msg.error || 'Failed to update user status');
          return;
        }
        closeModal(modal);
        loadStaff();
      });
    }

    if (removeBtn && !removeBtn.disabled) {
      removeBtn.addEventListener('click', async () => {
        const name = displayName;
        if (!confirm(`Remove ${name} from staff? This will immediately revoke access.`)) return;
        removeBtn.disabled = true;
        const res = await fetch(`/api/admin/staff/${member.id}`, { method: 'DELETE' });
        removeBtn.disabled = false;
        if (!res.ok) {
          const msg = await res.json().catch(() => ({}));
          alert(msg.error || 'Failed to remove staff member');
          return;
        }
        closeModal(modal);
        loadStaff();
      });
    }

    if (bonusOpenBtn && bonusModal && !bonusOpenBtn.disabled) bonusOpenBtn.addEventListener('click', () => openModal(bonusModal));
    if (bonusCancelBtn && bonusModal) bonusCancelBtn.addEventListener('click', () => closeModal(bonusModal));

    if (bonusSubmitBtn && bonusModal) {
      bonusSubmitBtn.addEventListener('click', async () => {
        const amount = Number(row.querySelector('[data-bonus-modal] input[name="bonus_amount"]')?.value || 0) || 0;
        const reason = String(row.querySelector('[data-bonus-modal] input[name="bonus_reason"]')?.value || '').trim();
        if (!amount || amount <= 0) {
          alert('Enter a bonus amount greater than 0');
          return;
        }
        bonusSubmitBtn.disabled = true;
        const res = await fetch(`/api/admin/staff/${member.id}/bonus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, reason }),
        });
        bonusSubmitBtn.disabled = false;
        const msg = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(msg.error || 'Failed to give bonus');
          return;
        }
        const amountInput = row.querySelector('[data-bonus-modal] input[name="bonus_amount"]');
        const reasonInput = row.querySelector('[data-bonus-modal] input[name="bonus_reason"]');
        if (amountInput) amountInput.value = '';
        if (reasonInput) reasonInput.value = '';
        closeModal(bonusModal);
        loadStaff();
      });
    }

    if (dockOpenBtn && dockModal && !dockOpenBtn.disabled) dockOpenBtn.addEventListener('click', () => openModal(dockModal));
    if (dockCancelBtn && dockModal) dockCancelBtn.addEventListener('click', () => closeModal(dockModal));
    if (dockSubmitBtn && dockModal) {
      dockSubmitBtn.addEventListener('click', async () => {
        const amount = Number(row.querySelector('[data-dock-modal] input[name="dock_amount"]')?.value || 0) || 0;
        const reason = String(row.querySelector('[data-dock-modal] input[name="dock_reason"]')?.value || '').trim();
        if (!amount || amount <= 0) {
          alert('Enter a dock amount greater than 0');
          return;
        }
        dockSubmitBtn.disabled = true;
        const res = await fetch(`/api/admin/staff/${member.id}/dock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, reason }),
        });
        dockSubmitBtn.disabled = false;
        const msg = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(msg.error || 'Failed to dock pay');
          return;
        }
        const amountInput = row.querySelector('[data-dock-modal] input[name="dock_amount"]');
        const reasonInput = row.querySelector('[data-dock-modal] input[name="dock_reason"]');
        if (amountInput) amountInput.value = '';
        if (reasonInput) reasonInput.value = '';
        closeModal(dockModal);
        loadStaff();
      });
    }

    list.appendChild(row);
  });

  const roleSelect = document.querySelector('[data-staff-role]');
  roleSelect.innerHTML = '';
  data.roles.forEach((role) => {
    const option = document.createElement('option');
    option.value = role.id;
    option.textContent = role.name;
    roleSelect.appendChild(option);
  });
};

const handleCreate = async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = {
    discord_id: formData.get('discord_id'),
    role_id: formData.get('role_id'),
    is_active: true,
  };
  const nickname = String(formData.get('nickname') || '').trim();
  if (nickname) payload.nickname = nickname;
  if (state.canManagePay) {
    payload.pay_per_ticket = Number(formData.get('pay_per_ticket') || 0) || 0;
  }
  await fetch('/api/admin/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  event.target.reset();
  loadStaff();
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-create-staff]').addEventListener('submit', handleCreate);
  loadStaff();
});
