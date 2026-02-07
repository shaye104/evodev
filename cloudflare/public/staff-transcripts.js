const renderRows = (rows) => {
  const tbody = document.querySelector('[data-transcripts-body]');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6">No transcripts found.</td>';
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((t) => {
    const tr = document.createElement('tr');
    const createdAt = window.supportFormatDateTime?.(t.created_at) || (t.created_at || '');
    const htmlUrl = `/api/staff/tickets/${t.ticket_public_id}/transcripts/${t.id}?format=html`;
    const jsonUrl = `/api/staff/tickets/${t.ticket_public_id}/transcripts/${t.id}?format=json`;
    tr.innerHTML = `
      <td><a href="/staff-ticket.html?id=${t.ticket_public_id}">#${t.ticket_public_id}</a></td>
      <td>${t.subject || 'Support ticket'}</td>
      <td>${t.panel_name || 'General'}</td>
      <td>${t.trigger || 'manual'}</td>
      <td>${createdAt}</td>
      <td class="inline">
        <a class="btn secondary small" target="_blank" rel="noopener" href="${htmlUrl}">HTML</a>
        <a class="btn secondary small" target="_blank" rel="noopener" href="${jsonUrl}">JSON</a>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

const loadPanels = async () => {
  const res = await fetch('/api/panels');
  const data = await res.json().catch(() => ({}));
  const select = document.querySelector('[data-filter-panel]');
  if (!select) return;
  (data.panels || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
};

const fetchTranscripts = async () => {
  const panelId = document.querySelector('[data-filter-panel]')?.value || '';
  const trigger = document.querySelector('[data-filter-trigger]')?.value || '';
  const params = new URLSearchParams();
  if (panelId) params.set('panel_id', panelId);
  if (trigger) params.set('trigger', trigger);
  const res = await fetch(`/api/staff/transcripts?${params.toString()}`);
  if (res.status === 403 || res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json().catch(() => ({}));
  renderRows(data.transcripts || []);
};

document.addEventListener('DOMContentLoaded', () => {
  loadPanels().then(fetchTranscripts);
  document.querySelector('[data-filter-form]')?.addEventListener('change', fetchTranscripts);
});

