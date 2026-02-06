const loadLogs = async () => {
  const res = await fetch('/api/admin/audit');
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  const tbody = document.querySelector('[data-audit-body]');
  tbody.innerHTML = '';
  (data.logs || []).forEach((log) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${log.created_at || ''}</td>
      <td>${log.actor_discord_id || log.actor_user_id || 'system'}</td>
      <td>${log.action || ''}</td>
      <td>${log.entity_type || ''} ${log.entity_id || ''}</td>
    `;
    tbody.appendChild(row);
  });
};

document.addEventListener('DOMContentLoaded', loadLogs);
