const loadStaff = async () => {
  const res = await fetch('/api/admin/staff');
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  const list = document.querySelector('[data-staff-list]');
  list.innerHTML = '';

  data.staff.forEach((member) => {
    const isSuspended = !member.is_active;
    const form = document.createElement('form');
    form.className = 'form inline-form';
    const options = data.roles
      .map(
        (role) =>
          `<option value="${role.id}" ${String(role.id) === String(member.role_id) ? 'selected' : ''}>${role.name}</option>`
      )
      .join('');
    form.innerHTML = `
      <span>${member.discord_username || member.discord_id} ${isSuspended ? '<span class="pill" style="margin-left:8px;">Suspended</span>' : ''}</span>
      <input type="number" name="pay_per_ticket" min="0" step="1" value="${Number(member.pay_per_ticket || 0) || 0}" placeholder="0" aria-label="Pay per ticket (R$)">
      <select name="role_id">${options}</select>
      <button class="btn secondary" type="submit">Update</button>
      <button class="btn secondary" type="button" data-manage-user>Manage user</button>

      <dialog class="modal" data-manage-modal aria-hidden="true">
        <div class="modal-content">
          <div class="modal-header">
            <h4>Manage user</h4>
          </div>
          <div class="modal-body">
            <p class="muted">Changes apply immediately.</p>
          </div>
          <div class="modal-actions" style="justify-content: space-between;">
            <button class="btn warning secondary" type="button" data-suspend-toggle>
              ${isSuspended ? 'Unsuspend' : 'Suspend'}
            </button>
            <div class="inline" style="margin: 0;">
              <button class="btn secondary" type="button" data-modal-cancel>Close</button>
              <button class="btn danger" type="button" data-remove-user>Remove</button>
            </div>
          </div>
        </div>
      </dialog>
    `;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      await fetch(`/api/admin/staff/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: formData.get('role_id'),
          is_active: Boolean(member.is_active), // suspension handled via Manage user modal
          pay_per_ticket: Number(formData.get('pay_per_ticket') || 0) || 0,
        }),
      });
      loadStaff();
    });

    const modal = form.querySelector('[data-manage-modal]');
    const openBtn = form.querySelector('[data-manage-user]');
    const closeBtn = form.querySelector('[data-modal-cancel]');
    const suspendBtn = form.querySelector('[data-suspend-toggle]');
    const removeBtn = form.querySelector('[data-remove-user]');

    const openModal = () => {
      if (!modal) return;
      modal.setAttribute('aria-hidden', 'false');
      if (typeof modal.showModal === 'function') modal.showModal();
      else modal.classList.add('open');
    };
    const closeModal = () => {
      if (!modal) return;
      modal.setAttribute('aria-hidden', 'true');
      if (typeof modal.close === 'function') modal.close();
      else modal.classList.remove('open');
    };

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    if (suspendBtn) {
      suspendBtn.addEventListener('click', async () => {
        suspendBtn.disabled = true;
        const nextActive = isSuspended; // if currently suspended => unsuspend => true
        const roleId = form.querySelector('select[name="role_id"]')?.value || member.role_id;
        const payPerTicket = Number(form.querySelector('input[name="pay_per_ticket"]')?.value || 0) || 0;
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
          alert('Failed to update user status');
          return;
        }
        closeModal();
        loadStaff();
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        const name = member.discord_username || member.discord_id;
        if (!confirm(`Remove ${name} from staff? This will immediately revoke access.`)) return;
        removeBtn.disabled = true;
        const res = await fetch(`/api/admin/staff/${member.id}`, { method: 'DELETE' });
        removeBtn.disabled = false;
        if (!res.ok) {
          const msg = await res.json().catch(() => ({}));
          alert(msg.error || 'Failed to remove staff member');
          return;
        }
        closeModal();
        loadStaff();
      });
    }

    list.appendChild(form);
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
