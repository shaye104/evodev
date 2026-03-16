const openModal = (modal) => {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'false');
  try {
    if (typeof modal.showModal === 'function') modal.showModal();
    else throw new Error('showModal not supported');
  } catch {
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

const buildParamsFromForm = (form) => {
  const params = new URLSearchParams();
  if (!form) return params;
  const action = String(form.querySelector('input[name="action"]')?.value || '').trim();
  const actor = String(form.querySelector('input[name="actor_discord_id"]')?.value || '').trim();
  const entityType = String(form.querySelector('input[name="entity_type"]')?.value || '').trim();
  const from = String(form.querySelector('input[name="date_from"]')?.value || '').trim();
  const to = String(form.querySelector('input[name="date_to"]')?.value || '').trim();

  if (action) params.set('action', action);
  if (actor) params.set('actor_discord_id', actor);
  if (entityType) params.set('entity_type', entityType);
  if (from) params.set('date_from', from);
  if (to) params.set('date_to', to);
  return params;
};

const loadLogs = async () => {
  const url = new URL(window.location.href);
  const res = await fetch(`/api/admin/audit?${url.searchParams.toString()}`);
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

document.addEventListener('DOMContentLoaded', () => {
  const filterModal = document.querySelector('[data-filter-modal]');
  const filterBtn = document.querySelector('[data-open-filter]');
  const filterForm = document.querySelector('[data-filter-form]');
  const applyBtn = document.querySelector('[data-filter-apply]');
  const clearBtn = document.querySelector('[data-filter-clear]');

  // Prefill form from URL
  const url = new URL(window.location.href);
  const get = (k) => String(url.searchParams.get(k) || '');
  if (filterForm) {
    filterForm.querySelector('input[name="action"]').value = get('action');
    filterForm.querySelector('input[name="actor_discord_id"]').value = get('actor_discord_id');
    filterForm.querySelector('input[name="entity_type"]').value = get('entity_type');
    filterForm.querySelector('input[name="date_from"]').value = get('date_from');
    filterForm.querySelector('input[name="date_to"]').value = get('date_to');
  }

  if (filterBtn) filterBtn.addEventListener('click', () => openModal(filterModal));
  document.querySelectorAll('[data-modal-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.closest('dialog')));
  });
  if (filterModal) {
    filterModal.addEventListener('click', (e) => {
      if (e.target === filterModal) closeModal(filterModal);
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const next = new URL(window.location.href);
      next.search = buildParamsFromForm(filterForm).toString();
      window.history.replaceState({}, '', next);
      closeModal(filterModal);
      loadLogs();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (filterForm) filterForm.reset();
      const next = new URL(window.location.href);
      next.search = '';
      window.history.replaceState({}, '', next);
      closeModal(filterModal);
      loadLogs();
    });
  }

  loadLogs();
});
