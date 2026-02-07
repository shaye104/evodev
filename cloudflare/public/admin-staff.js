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

const openModal = (modal) => {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'false');
  if (typeof modal.showModal === 'function') modal.showModal();
  else modal.classList.add('open');
};

const closeModal = (modal) => {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  if (typeof modal.close === 'function') modal.close();
  else modal.classList.remove('open');
};

const loadStaff = async () => {
  const res = await fetch('/api/admin/staff');
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  const list = document.querySelector('[data-staff-list]');
  list.innerHTML = '';

  const canManagePay = staffHasPermission(data.me, 'staff.manage_pay');

  data.staff.forEach((member) => {
    const isSuspended = !member.is_active;
    const row = document.createElement('div');
    row.className = 'inline-form';
    const options = data.roles
      .map(
        (role) =>
          `<option value="${role.id}" ${String(role.id) === String(member.role_id) ? 'selected' : ''}>${role.name}</option>`
      )
      .join('');
    const displayName = member.discord_username || member.discord_id;
    const roleName = member.role_name || (member.is_admin ? 'Admin' : 'Staff');
    const roleBg = String(member.color_bg || '').trim();
    const roleText = String(member.color_text || '').trim() || '#ffffff';
    const roleStyle = roleBg
      ? `style="background:${roleBg};border-color:${roleBg};color:${roleText};"`
      : '';
    const roleClass = member.is_admin ? 'role-admin' : 'role-staff';
    const pay = Number(member.pay_per_ticket || 0) || 0;

    row.innerHTML = `
      <span>
        ${displayName}
        ${isSuspended ? '<span class="pill warning" style="margin-left:8px;">Suspended</span>' : ''}
      </span>
      <span class="role-pill ${roleClass}" ${roleStyle}>${roleName}</span>
      <span class="pill">Pay: R$${pay}</span>
      <button class="btn secondary" type="button" data-manage-user>Manage user</button>
      ${canManagePay ? '<button class="btn secondary" type="button" data-open-bonus>Give bonus</button>' : ''}

      <dialog class="modal" data-manage-modal aria-hidden="true">
        <div class="modal-content">
          <div class="modal-header">
            <h4>Manage user</h4>
          </div>
          <div class="modal-body">
            <div class="form">
              <label>
                Role
                <select name="role_id" data-role-select>${options}</select>
              </label>
              <label>
                Pay per ticket (R$)
                <span class="hint-icon" tabindex="0" data-hint="Used for the staff dashboard earnings tracker. Changes notify the staff member."></span>
                <input type="number" name="pay_per_ticket" min="0" step="1" value="${pay}" placeholder="0">
              </label>
            </div>

            <div class="muted" style="margin-top: 12px;">Changes apply immediately.</div>
          </div>
          <div class="modal-actions" style="justify-content: space-between;">
            <button class="btn secondary" type="button" data-modal-cancel>Close</button>
            <div class="inline" style="margin: 0;">
              <button class="btn" type="button" data-save-settings>Save changes</button>
              <button class="btn warning" type="button" data-suspend-toggle>
                ${isSuspended ? 'Unsuspend' : 'Suspend'}
              </button>
              <button class="btn danger" type="button" data-remove-user>Remove</button>
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
                      <input type="number" name="bonus_amount" min="1" step="1" placeholder="0" required>
                    </label>
                    <label>
                      Reason (optional)
                      <input type="text" name="bonus_reason" placeholder="e.g. Great performance">
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

    if (openBtn) openBtn.addEventListener('click', () => openModal(modal));
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

    const getModalValues = () => {
      const roleId = row.querySelector('[data-role-select]')?.value || member.role_id;
      const payPerTicket = Number(row.querySelector('input[name="pay_per_ticket"]')?.value || 0) || 0;
      return { roleId, payPerTicket };
    };

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        const { roleId, payPerTicket } = getModalValues();
        const res = await fetch(`/api/admin/staff/${member.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role_id: roleId,
            is_active: Boolean(member.is_active),
            pay_per_ticket: payPerTicket,
          }),
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
        const { roleId, payPerTicket } = getModalValues();
        const nextActive = isSuspended; // if currently suspended => unsuspend => true
        const res = await fetch(`/api/admin/staff/${member.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role_id: roleId,
            is_active: nextActive,
            pay_per_ticket: payPerTicket,
          }),
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

    if (removeBtn) {
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

    if (bonusOpenBtn && bonusModal) bonusOpenBtn.addEventListener('click', () => openModal(bonusModal));
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
        alert('Bonus added and notification sent.');
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
  await fetch('/api/admin/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      discord_id: formData.get('discord_id'),
      role_id: formData.get('role_id'),
      is_active: true,
      pay_per_ticket: Number(formData.get('pay_per_ticket') || 0) || 0,
    }),
  });
  event.target.reset();
  loadStaff();
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-create-staff]').addEventListener('submit', handleCreate);
  loadStaff();
});
