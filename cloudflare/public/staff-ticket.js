const getTicketId = () => new URLSearchParams(window.location.search).get('id');

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const staffHasPermission = (staff, permission) => {
  if (!staff) return false;
  if (staff.is_admin) return true;
  if (!staff.permissions) return false;
  try {
    const perms = JSON.parse(staff.permissions);
    if (Array.isArray(perms)) {
      if (perms.includes('*')) return true;
      return perms.includes(permission);
    }
  } catch {}
  return false;
};

const getAvatarUrl = (msg) => {
  const discordId = msg.author_discord_id;
  const avatarHash = msg.author_avatar;
  if (discordId && avatarHash) {
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?size=64`;
  }
  const index = discordId
    ? (parseInt(String(discordId).slice(-1), 10) || 0) % 5
    : 0;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
};

const getAuthorName = (msg) => {
  if (msg.author_username) return msg.author_username;
  return msg.author_type === 'staff' ? 'Staff' : 'User';
};

const getRoleInfo = (msg) => {
  if (msg.author_type === 'staff') {
    const label =
      msg.author_role_name || (msg.author_is_admin ? 'Admin' : 'Staff');
    const className = msg.author_is_admin ? 'role-admin' : 'role-staff';
    return {
      label,
      className,
      colorBg: msg.author_role_color_bg || null,
      colorText: msg.author_role_color_text || null,
    };
  }
  return { label: 'User', className: 'role-user' };
};

const formatClock = (date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatLongDate = (date) => {
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const day = String(date.getDate());
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year} at ${formatClock(date)}`;
};

const formatRelativeTime = (value) => {
  const parsed =
    typeof window.supportParseDateTime === 'function'
      ? window.supportParseDateTime(value)
      : new Date(value);
  const date = parsed instanceof Date ? parsed : null;
  if (!date || Number.isNaN(date.getTime())) {
    return typeof window.supportFormatDateTime === 'function'
      ? window.supportFormatDateTime(value)
      : value;
  }
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (dateDay.getTime() === yesterday.getTime()) {
    return `yesterday at ${formatClock(date)}`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }
  return typeof window.supportFormatLongDateTime === 'function'
    ? window.supportFormatLongDateTime(date)
    : formatLongDate(date);
};

const openModal = (modal) => {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'false');
  if (typeof modal.showModal === 'function') {
    modal.showModal();
  } else {
    modal.classList.add('open');
  }
};

const closeModal = (modal) => {
  if (!modal) return;
  modal.setAttribute('aria-hidden', 'true');
  if (typeof modal.close === 'function') {
    modal.close();
  } else {
    modal.classList.remove('open');
  }
};

let currentTicket = null;
let currentStaff = null;

const renderTicket = (payload) => {
  const { ticket, messages, attachments } = payload;
  currentTicket = ticket;
  document.querySelector('[data-ticket-title]').textContent = `Ticket #${ticket.public_id}`;
  document.querySelector('[data-ticket-subject]').textContent = ticket.subject || 'Support ticket';
  document.querySelector('[data-ticket-meta]').textContent = `${ticket.panel_name || 'General'} • ${ticket.status_name || 'Open'}`;
  const subjectInput = document.querySelector('[data-subject-input]');
  if (subjectInput) subjectInput.value = ticket.subject || '';

  const attachmentMap = new Map();
  (attachments || []).forEach((att) => {
    if (!attachmentMap.has(att.ticket_message_id)) {
      attachmentMap.set(att.ticket_message_id, []);
    }
    attachmentMap.get(att.ticket_message_id).push(att);
  });

  const thread = document.querySelector('[data-ticket-thread]');
  thread.innerHTML = '';
  messages.forEach((msg) => {
    const article = document.createElement('article');
    article.className = 'message';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const author = document.createElement('div');
    author.className = 'message-author';
    const avatar = document.createElement('img');
    avatar.className = 'message-avatar';
    avatar.src = getAvatarUrl(msg);
    avatar.alt = `${getAuthorName(msg)} avatar`;
    avatar.loading = 'lazy';
    const info = document.createElement('div');
    info.className = 'author-info';
    const name = document.createElement('span');
    name.className = 'author-name';
    name.textContent = getAuthorName(msg);
    const role = getRoleInfo(msg);
    const roleBadge = document.createElement('span');
    roleBadge.className = `role-pill ${role.className}`;
    roleBadge.textContent = role.label;
    if (role.colorBg) {
      roleBadge.style.backgroundColor = role.colorBg;
      roleBadge.style.borderColor = role.colorBg;
      roleBadge.style.color = role.colorText || '#ffffff';
    }
    info.appendChild(name);
    info.appendChild(roleBadge);
    author.appendChild(avatar);
    author.appendChild(info);
    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = formatRelativeTime(msg.created_at);
    meta.appendChild(author);
    meta.appendChild(time);
    const body = document.createElement('pre');
    body.className = 'message-body';
    body.textContent = msg.body;
    article.appendChild(meta);
    article.appendChild(body);
    const attachmentsList = attachmentMap.get(msg.id) || [];
    if (attachmentsList.length) {
      const wrap = document.createElement('div');
      wrap.className = 'attachments';
      attachmentsList.forEach((att) => {
        const link = document.createElement('a');
        link.href = att.storage_url || `/api/attachments/${att.id}`;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = `📎 ${att.filename}`;
        wrap.appendChild(link);
      });
      article.appendChild(wrap);
    }
    thread.appendChild(article);
  });

  const claimBtn = document.querySelector('[data-claim-button]');
  const isClosed = Boolean(ticket.is_closed) || Boolean(ticket.closed_at);
  if (claimBtn) {
    const assignedId = Number(ticket.assigned_staff_id || 0) || null;
    const meId = Number(currentStaff?.id || 0) || null;
    const isMine = assignedId && meId && assignedId === meId;
    claimBtn.textContent = isMine ? 'Unclaim' : 'Claim';
    claimBtn.dataset.action = isMine ? 'unclaim' : 'claim';
  }

  const escalateBtn = document.querySelector('[data-escalate-open]');
  if (escalateBtn) escalateBtn.disabled = isClosed || escalateBtn.disabled;
  const closeBtn = document.querySelector('[data-close-open]');
  if (closeBtn) closeBtn.disabled = isClosed || closeBtn.disabled;
};

const fetchTicket = async () => {
  const id = getTicketId();
  if (!id) return;
  const res = await fetch(`/api/staff/tickets/${id}`);
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await safeJson(res);
  if (!data) {
    window.location.href = '/login.html';
    return;
  }
  renderTicket(data);
};

const handleReply = async (event) => {
  event.preventDefault();
  const id = getTicketId();
  const formData = new FormData(event.target);
  const res = await fetch(`/api/staff/tickets/${id}/messages`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to send reply');
    return;
  }
  event.target.reset();
  await fetchTicket();
};

const handleClaim = async () => {
  const id = getTicketId();
  const action = document.querySelector('[data-claim-button]').dataset.action;
  await fetch(`/api/staff/tickets/${id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  fetchTicket();
};

const handleSaveSubject = async () => {
  const id = getTicketId();
  const input = document.querySelector('[data-subject-input]');
  if (!id || !input) return;

  const subject = String(input.value || '').trim();
  if (!subject) {
    alert('Subject cannot be empty');
    return;
  }
  const btn = document.querySelector('[data-subject-save]');
  if (btn) btn.disabled = true;
  const res = await fetch(`/api/staff/tickets/${id}/subject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject }),
  });
  if (btn) btn.disabled = false;
  const data = (await safeJson(res)) || {};
  if (!res.ok) {
    alert(data.error || 'Failed to update subject');
    return;
  }
  closeModal(document.querySelector('[data-subject-modal]'));
  fetchTicket();
};

const handleOpenSubject = () => {
  const modal = document.querySelector('[data-subject-modal]');
  const input = modal?.querySelector('[data-subject-input]');
  if (input) input.value = currentTicket?.subject || '';
  openModal(modal);
  setTimeout(() => input?.focus?.(), 0);
};

const loadEscalatePanels = async () => {
  const container = document.querySelector('[data-escalate-panels]');
  if (!container) return;
  container.innerHTML = '';
  const res = await fetch('/api/staff/panels').catch(() => null);
  const data = res ? await safeJson(res) : null;
  if (res?.status === 403) {
    container.innerHTML = '<p class="muted">You do not have permission to escalate tickets.</p>';
    return;
  }
  if (!res?.ok || !data?.panels || !Array.isArray(data.panels)) {
    container.innerHTML = '<p class="muted">Unable to load panels.</p>';
    return;
  }

  const currentPanelId = Number(currentTicket?.panel_id || 0) || null;
  data.panels.forEach((panel) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn secondary perm-option';
    btn.dataset.escalatePanelId = String(panel.id);
    btn.textContent = panel.name || `Panel ${panel.id}`;
    if (currentPanelId && Number(panel.id) === currentPanelId) {
      btn.disabled = true;
      btn.title = 'Ticket is already in this panel';
    }
    container.appendChild(btn);
  });
};

const handleOpenEscalate = async () => {
  const modal = document.querySelector('[data-escalate-modal]');
  openModal(modal);
  await loadEscalatePanels();
};

const handleEscalateTo = async (panelId) => {
  const id = getTicketId();
  if (!id) return;
  const res = await fetch(`/api/staff/tickets/${id}/escalate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ panel_id: panelId }),
  });
  const data = (await safeJson(res)) || {};
  if (!res.ok) {
    alert(data.error || 'Failed to escalate ticket');
    return;
  }
  closeModal(document.querySelector('[data-escalate-modal]'));
  if (data.can_access === false) {
    window.location.href = '/staff-open.html';
    return;
  }
  await fetchTicket();
};

const handleOpenClose = () => {
  openModal(document.querySelector('[data-close-modal]'));
};

const handleCloseTicket = async () => {
  const id = getTicketId();
  if (!id) return;
  const btn = document.querySelector('[data-close-confirm]');
  if (btn) btn.disabled = true;
  const res = await fetch(`/api/staff/tickets/${id}/close`, { method: 'POST' });
  if (btn) btn.disabled = false;
  const data = (await safeJson(res)) || {};
  if (!res.ok) {
    alert(data.error || 'Failed to close ticket');
    return;
  }
  closeModal(document.querySelector('[data-close-modal]'));
  window.location.href = '/staff-open.html';
};

const renderTranscripts = (rows) => {
  const el = document.querySelector('[data-transcripts-list]');
  if (!el) return;
  if (!rows.length) {
    el.textContent = 'No transcripts yet.';
    return;
  }
  const id = getTicketId();
  const formatTime = (v) => window.supportFormatDateTime?.(v) || v || '';
  el.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Created</th>
          <th>Trigger</th>
          <th>Download</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((t) => {
            const created = formatTime(t.created_at);
            const trigger = t.trigger || 'manual';
            const htmlUrl = `/api/staff/tickets/${id}/transcripts/${t.id}?format=html`;
            const jsonUrl = `/api/staff/tickets/${id}/transcripts/${t.id}?format=json`;
            return `
              <tr>
                <td>${created}</td>
                <td>${trigger}</td>
                <td class="inline">
                  <a class="btn secondary" target="_blank" rel="noopener" href="${htmlUrl}">HTML</a>
                  <a class="btn secondary" target="_blank" rel="noopener" href="${jsonUrl}">JSON</a>
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
};

const loadTranscripts = async () => {
  const id = getTicketId();
  const el = document.querySelector('[data-transcripts-list]');
  if (!id || !el) return;
  el.textContent = 'Loading…';
  const res = await fetch(`/api/staff/tickets/${id}/transcripts`);
  if (res.status === 403) {
    el.textContent = 'You do not have permission to view transcripts (requires View tickets).';
    return;
  }
  if (res.status === 401) {
    el.textContent = 'Please login to view transcripts.';
    return;
  }
  if (!res.ok) {
    el.textContent = 'Unable to load transcripts. Please refresh and try again.';
    return;
  }
  const data = await safeJson(res);
  if (!data) {
    el.textContent = 'Unable to load transcripts. Please refresh and try again.';
    return;
  }
  renderTranscripts(data.transcripts || []);
};

const handleGenerateTranscript = async () => {
  const id = getTicketId();
  const btn = document.querySelector('[data-transcript-generate]');
  if (!id || !btn) return;
  btn.disabled = true;
  const res = await fetch(`/api/staff/tickets/${id}/transcripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'manual' }),
  });
  btn.disabled = false;
  const data = (await safeJson(res)) || {};
  if (!res.ok) {
    alert(data.error || 'Failed to generate transcript');
    return;
  }
  loadTranscripts();
};

document.addEventListener('DOMContentLoaded', async () => {
  // Bind buttons first so the page still works even if a fetch fails.
  const replyForm = document.querySelector('[data-reply-form]');
  if (replyForm) replyForm.addEventListener('submit', handleReply);
  const claimBtn = document.querySelector('[data-claim-button]');
  if (claimBtn) claimBtn.addEventListener('click', handleClaim);
  const subjectEditBtn = document.querySelector('[data-subject-edit]');
  if (subjectEditBtn) subjectEditBtn.addEventListener('click', handleOpenSubject);
  const subjectSaveBtn = document.querySelector('[data-subject-modal] [data-subject-save]');
  if (subjectSaveBtn) subjectSaveBtn.addEventListener('click', handleSaveSubject);
  const escalateBtn = document.querySelector('[data-escalate-open]');
  if (escalateBtn) escalateBtn.addEventListener('click', handleOpenEscalate);
  const closeBtn = document.querySelector('[data-close-open]');
  if (closeBtn) closeBtn.addEventListener('click', handleOpenClose);
  const closeConfirmBtn = document.querySelector('[data-close-confirm]');
  if (closeConfirmBtn) closeConfirmBtn.addEventListener('click', handleCloseTicket);
  const transcriptBtn = document.querySelector('[data-transcript-generate]');
  if (transcriptBtn) transcriptBtn.addEventListener('click', handleGenerateTranscript);

  // Use /api/me to hide/disable controls based on role permissions.
  const meRes = await fetch('/api/me').catch(() => null);
  const me = meRes ? await safeJson(meRes) : null;
  const staff = me?.staff || null;
  currentStaff = staff;

  const canClaim = staffHasPermission(staff, 'tickets.claim');
  const canStatus = staffHasPermission(staff, 'tickets.status');
  const canEscalate = staffHasPermission(staff, 'tickets.escalate');
  const canReply = staffHasPermission(staff, 'tickets.reply');
  const canView = staffHasPermission(staff, 'tickets.view');
  const canEditSubject = staffHasPermission(staff, 'tickets.subject');

  if (claimBtn) claimBtn.disabled = !canClaim;
  if (subjectEditBtn) subjectEditBtn.disabled = !canEditSubject;
  const subjectInput = document.querySelector('[data-subject-modal] [data-subject-input]');
  if (subjectInput) subjectInput.disabled = !canEditSubject;
  if (subjectSaveBtn) subjectSaveBtn.disabled = !canEditSubject;
  if (escalateBtn) escalateBtn.disabled = !canEscalate;
  if (closeBtn) closeBtn.disabled = !canStatus;
  if (closeConfirmBtn) closeConfirmBtn.disabled = !canStatus;
  if (replyForm) {
    const textarea = replyForm.querySelector('textarea[name="message"]');
    const file = replyForm.querySelector('input[type="file"][name="attachments"]');
    const submit = replyForm.querySelector('button[type="submit"]');
    if (textarea) textarea.disabled = !canReply;
    if (file) file.disabled = !canReply;
    if (submit) submit.disabled = !canReply;
  }
  if (transcriptBtn) transcriptBtn.disabled = !canView;

  // Modal cancel buttons
  document.querySelectorAll('[data-modal-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.closest('dialog')));
  });

  // Escalate modal button list handler
  document.addEventListener('click', (event) => {
    const panelBtn = event.target.closest('[data-escalate-panel-id]');
    if (!panelBtn) return;
    const pid = Number(panelBtn.dataset.escalatePanelId || 0) || null;
    if (!pid) return;
    handleEscalateTo(pid);
  });

  try {
    await fetchTicket();
  } catch {}
  if (canView) {
    try {
      await loadTranscripts();
    } catch {}
  } else {
    const el = document.querySelector('[data-transcripts-list]');
    if (el) el.textContent = 'You do not have permission to view transcripts (requires View tickets).';
  }
});
