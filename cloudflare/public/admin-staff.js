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
    const form = document.createElement('form');
    form.className = 'form inline-form';
    const options = data.roles
      .map(
        (role) =>
          `<option value="${role.id}" ${String(role.id) === String(member.role_id) ? 'selected' : ''}>${role.name}</option>`
      )
      .join('');
    form.innerHTML = `
      <span>${member.discord_username || member.discord_id}</span>
      <select name="role_id">${options}</select>
      <label class="checkbox">
        <input type="checkbox" name="is_active" value="1" ${member.is_active ? 'checked' : ''}>
        Active
      </label>
      <button class="btn secondary" type="submit">Update</button>
    `;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      await fetch(`/api/admin/staff/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: formData.get('role_id'),
          is_active: formData.get('is_active') === '1',
        }),
      });
      loadStaff();
    });
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
      is_active: formData.get('is_active') === '1',
    }),
  });
  event.target.reset();
  loadStaff();
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-create-staff]').addEventListener('submit', handleCreate);
  loadStaff();
});
