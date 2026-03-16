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
    // Only redirect for auth failures; permission failures should be visible.
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const msg = await res.json().catch(() => ({}));
    alert(msg.error || 'Unable to load staff list');
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
    row.className = 'staff-list-row';
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

    const canManagePayForMember = Boolean(canManagePay && canManageMember);

    row.innerHTML = `
      <span>
        ${displayName}
        ${isSuspended ? '<span class="pill warning" style="margin-left:8px;">Suspended</span>' : ''}
      </span>
      <span class="role-pill ${roleClass}" ${roleStyle}>${roleName}</span>
      <span class="pill">R$${pay}/ticket</span>
      <div class="row-actions">
        <div class="stack-actions">
          ${
            canManagePay
              ? `<button class="btn secondary" type="button" data-manage-pay ${!canManagePayForMember ? 'disabled' : ''}>Manage pay</button>`
              : ''
          }
          <button class="btn" type="button" data-manage-user ${!canManageMember ? 'disabled' : ''}>Manage user</button>
        </div>

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
              <dialog class="modal" data-pay-modal aria-hidden="true">
                <div class="modal-content">
                  <div class="modal-header">
                    <h4>Payroll</h4>
                  </div>
                  <div class="modal-body">
                    <div class="form">
                      <label>
                        Pay per ticket (R$)
                        <input type="number" name="pay_per_ticket" min="0" step="1" value="${pay}" placeholder="0" ${
                          !canManagePayForMember ? 'disabled' : ''
                        }>
                      </label>
                    </div>

                    <div class="divider" style="margin: 14px 0;"></div>

                    <div class="inline-form" style="margin: 0;">
                      <label>
                        Bonus (R$)
                        <input type="number" name="bonus_amount" min="1" step="1" placeholder="0" ${
                          !canManagePayForMember ? 'disabled' : ''
                        } autocomplete="off">
                      </label>
                      <label>
                        Dock (R$)
                        <input type="number" name="dock_amount" min="1" step="1" placeholder="0" ${
                          !canManagePayForMember ? 'disabled' : ''
                        } autocomplete="off">
                      </label>
                    </div>
                    <label style="margin-top: 10px;">
                      Reason (optional)
                      <input type="text" name="pay_reason" placeholder="e.g. Great performance / Missed requirements" ${
                        !canManagePayForMember ? 'disabled' : ''
                      } autocomplete="off">
                    </label>
                    <div class="muted" style="margin-top: 10px;">Bonus and dock send a notification immediately.</div>
                  </div>
                  <div class="modal-actions" style="justify-content: space-between;">
                    <div class="inline" style="margin: 0;">
                      <button class="btn secondary" type="button" data-dock-submit ${
                        !canManagePayForMember ? 'disabled' : ''
                      }>Dock pay</button>
                      <button class="btn" type="button" data-bonus-submit ${
                        !canManagePayForMember ? 'disabled' : ''
                      }>Give bonus</button>
                    </div>
                    <div class="inline" style="margin: 0;">
                      <button class="btn secondary" type="button" data-pay-cancel>Close</button>
                      <button class="btn" type="button" data-pay-save ${
                        !canManagePayForMember ? 'disabled' : ''
                      }>Save pay</button>
                    </div>
                  </div>
                </div>
              </dialog>
            `
            : ''
        }
      </div>
    `;

    const modal = row.querySelector('[data-manage-modal]');
    const openBtn = row.querySelector('[data-manage-user]');
    const closeBtn = row.querySelector('[data-modal-cancel]');
    const saveBtn = row.querySelector('[data-save-settings]');
    const suspendBtn = row.querySelector('[data-suspend-toggle]');
    const removeBtn = row.querySelector('[data-remove-user]');
    const payOpenBtn = row.querySelector('[data-manage-pay]');
    const payModal = row.querySelector('[data-pay-modal]');
    const payCancelBtn = row.querySelector('[data-pay-cancel]');
    const paySaveBtn = row.querySelector('[data-pay-save]');
    const bonusSubmitBtn = row.querySelector('[data-bonus-submit]');
    const dockSubmitBtn = row.querySelector('[data-dock-submit]');

    if (openBtn && !openBtn.disabled) openBtn.addEventListener('click', () => openModal(modal));
    if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal));
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
      });
    }
    if (payModal) {
      payModal.addEventListener('click', (e) => {
        if (e.target === payModal) closeModal(payModal);
      });
    }

    const getModalValues = () => {
      const roleId = row.querySelector('[data-role-select]')?.value || member.role_id;
      const nicknameInput = row.querySelector('[data-manage-modal] input[name="nickname"]');
      const nickname = nicknameInput
        ? String(nicknameInput.value || '').trim()
        : String(member.nickname || '').trim();
      return { roleId, nickname };
    };

		    if (saveBtn) {
		      saveBtn.addEventListener('click', async () => {
		        saveBtn.disabled = true;
		        const { roleId, nickname } = getModalValues();
	          const payload = {};
	          if (canManageStaff) {
	            payload.role_id = roleId;
	            payload.is_active = Boolean(member.is_active);
	            payload.nickname = nickname;
	          }
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
		        const { roleId, nickname } = getModalValues();
		        const nextActive = isSuspended; // if currently suspended => unsuspend => true
	          const payload = {};
	          if (canManageStaff) {
	            payload.role_id = roleId;
	            payload.is_active = nextActive;
	            payload.nickname = nickname;
	          }
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

    if (payOpenBtn && payModal && !payOpenBtn.disabled) payOpenBtn.addEventListener('click', () => openModal(payModal));
    if (payCancelBtn && payModal) payCancelBtn.addEventListener('click', () => closeModal(payModal));

    if (paySaveBtn && payModal) {
      paySaveBtn.addEventListener('click', async () => {
        const payInput = row.querySelector('[data-pay-modal] input[name="pay_per_ticket"]');
        const nextPay = payInput ? Number(payInput.value || 0) || 0 : pay;
        paySaveBtn.disabled = true;
        const res = await fetch(`/api/admin/staff/${member.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pay_per_ticket: nextPay }),
        });
        paySaveBtn.disabled = false;
        const msg = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(msg.error || 'Failed to update pay');
          return;
        }
        closeModal(payModal);
        loadStaff();
      });
    }

    if (bonusSubmitBtn && payModal) {
      bonusSubmitBtn.addEventListener('click', async () => {
        const amount = Number(row.querySelector('[data-pay-modal] input[name="bonus_amount"]')?.value || 0) || 0;
        const reason = String(row.querySelector('[data-pay-modal] input[name="pay_reason"]')?.value || '').trim();
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
        const amountInput = row.querySelector('[data-pay-modal] input[name="bonus_amount"]');
        const reasonInput = row.querySelector('[data-pay-modal] input[name="pay_reason"]');
        if (amountInput) amountInput.value = '';
        if (reasonInput) reasonInput.value = '';
        loadStaff();
      });
    }

    if (dockSubmitBtn && payModal) {
      dockSubmitBtn.addEventListener('click', async () => {
        const amount = Number(row.querySelector('[data-pay-modal] input[name="dock_amount"]')?.value || 0) || 0;
        const reason = String(row.querySelector('[data-pay-modal] input[name="pay_reason"]')?.value || '').trim();
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
        const amountInput = row.querySelector('[data-pay-modal] input[name="dock_amount"]');
        const reasonInput = row.querySelector('[data-pay-modal] input[name="pay_reason"]');
        if (amountInput) amountInput.value = '';
        if (reasonInput) reasonInput.value = '';
        loadStaff();
      });
    }

    list.appendChild(row);
  });

  const roleSelect = document.querySelector('[data-staff-role]');
  const prevSelected = roleSelect ? String(roleSelect.value || '') : '';
  roleSelect.innerHTML = '';
  const assignable = [];
  data.roles.forEach((role) => {
    const option = document.createElement('option');
    option.value = role.id;
    option.textContent = role.name;
    const rolePos = toPos(role.sort_order ?? 999999);
    const disabled =
      !state.me?.is_admin &&
      (!canManageStaff || Boolean(role.is_admin) || !(actorPos < rolePos));
    option.disabled = disabled;
    roleSelect.appendChild(option);
    if (!disabled) assignable.push(String(role.id));
  });

  // Default to a role the actor is actually allowed to assign.
  if (assignable.length) {
    if (!assignable.includes(prevSelected)) roleSelect.value = assignable[0];
  }
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
  const res = await fetch('/api/admin/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const msg = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(msg.error || 'Failed to add staff member');
    return;
  }
  event.target.reset();
  loadStaff();
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-create-staff]').addEventListener('submit', handleCreate);
  loadStaff();
});
