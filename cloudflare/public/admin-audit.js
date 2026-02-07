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
    const createdAt = window.supportFormatDateTime?.(log.created_at) || (log.created_at || '');
    row.innerHTML = `
      <td>${createdAt}</td>
      <td>${log.actor_discord_id || log.actor_user_id || 'system'}</td>
      <td>${log.action || ''}</td>
      <td>${log.entity_type || ''} ${log.entity_id || ''}</td>
    `;
    tbody.appendChild(row);
  });
};

document.addEventListener('DOMContentLoaded', loadLogs);
