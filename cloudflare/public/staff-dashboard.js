const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast show';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 6000);
}

const ensureBonusUi = () => {
  if (document.getElementById('bonus-ui-style')) return;
  const style = document.createElement('style');
  style.id = 'bonus-ui-style';
  style.textContent = `
    @keyframes bonusConfettiFall {
      from { transform: translateY(-30px) rotate(0deg); opacity: 1; }
      to { transform: translateY(110vh) rotate(360deg); opacity: 0.95; }
    }
    .bonus-confetti-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 60;
      overflow: hidden;
    }
    .bonus-confetti {
      position: absolute;
      top: -40px;
      will-change: transform;
      animation-name: bonusConfettiFall;
      animation-timing-function: linear;
    }
    .bonus-popup-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 20, 30, 0.35);
      z-index: 59;
    }
    .bonus-popup {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: min(520px, 90vw);
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.18);
      padding: 20px;
      z-index: 61;
      text-align: center;
    }
    .bonus-popup h3 {
      margin: 0 0 8px;
      color: var(--text-strong);
    }
    .bonus-popup .amount {
      font-size: 34px;
      font-weight: 900;
      color: var(--accent);
      margin: 6px 0 12px;
    }
    .bonus-popup .reason {
      color: var(--muted);
      font-size: 14px;
      margin: 0 0 14px;
    }
    .bonus-popup .actions {
      display: flex;
      justify-content: center;
      gap: 10px;
    }
  `;
  document.head.appendChild(style);
};

const parseMeta = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const rainConfetti = (durationMs = 2200) => {
  ensureBonusUi();
  const layer = document.createElement('div');
  layer.className = 'bonus-confetti-layer';

  const count = 70;
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('span');
    el.className = 'bonus-confetti';
    el.textContent = '🎉';
    const left = Math.random() * 100;
    const size = 16 + Math.floor(Math.random() * 18);
    const delay = Math.random() * 250;
    const duration = 1600 + Math.floor(Math.random() * 1400);
    el.style.left = `${left}%`;
    el.style.fontSize = `${size}px`;
    el.style.animationDelay = `${delay}ms`;
    el.style.animationDuration = `${duration}ms`;
    layer.appendChild(el);
  }

  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), durationMs + 1200);
};

const showBonusPopup = ({ amount, reason }) => {
  ensureBonusUi();
  const backdrop = document.createElement('div');
  backdrop.className = 'bonus-popup-backdrop';
  const popup = document.createElement('div');
  popup.className = 'bonus-popup';
  popup.innerHTML = `
    <h3>Bonus received!</h3>
    <div class="amount">R$${Number(amount || 0) || 0}</div>
    ${reason ? `<p class="reason">${reason}</p>` : '<p class="reason">Keep it up.</p>'}
    <div class="actions">
      <button class="btn" type="button" data-bonus-close>Nice!</button>
    </div>
  `;

  const cleanup = () => {
    backdrop.remove();
    popup.remove();
  };
  backdrop.addEventListener('click', cleanup);
  popup.querySelector('[data-bonus-close]')?.addEventListener('click', cleanup);

  document.body.appendChild(backdrop);
  document.body.appendChild(popup);

  // Auto close after a short moment.
  setTimeout(cleanup, 6500);
};

async function loadNotifications() {
  const res = await fetch('/api/staff/notifications');
  if (!res.ok) return;
  const data = await safeJson(res);
  const notifications = data?.notifications || [];
  if (!notifications.length) return;

  // Bonus celebration (combine multiple bonuses into one popup)
  const bonus = notifications.filter((n) => n.type === 'pay.bonus');
  if (bonus.length) {
    const amounts = bonus
      .map((n) => {
        const meta = parseMeta(n.metadata);
        if (meta && Number.isFinite(Number(meta.amount))) return Number(meta.amount);
        const m = String(n.message || '').match(/R\\$(\\d+)/);
        return m ? Number(m[1]) : 0;
      })
      .filter((v) => Number.isFinite(v) && v > 0);
    const total = amounts.reduce((a, b) => a + b, 0);
    const singleReason = bonus.length === 1 ? (parseMeta(bonus[0].metadata)?.reason || '') : '';
    rainConfetti();
    showBonusPopup({ amount: total || 0, reason: singleReason });
  }

  // Standard toasts for non-bonus notifications
  notifications
    .filter((n) => n.type !== 'pay.bonus')
    .slice()
    .reverse()
    .forEach((n) => showToast(n.message || 'Notification'));

  await fetch('/api/staff/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: notifications.map((n) => n.id) }),
  }).catch(() => null);
}

const renderLeaderboard = (payload) => {
  const el = document.querySelector('[data-leaderboard]');
  if (!el) return;
  const rows = payload.leaderboard || [];
  if (!rows.length) {
    el.textContent = 'No data yet.';
    return;
  }
  el.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Staff</th>
          <th>Answered</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const name = r.display_name || r.discord_id || `Staff ${r.staff_id}`;
            const answered = Number(r.answered_tickets || 0) || 0;
            const isMe = String(r.staff_id) === String(payload.me?.staff_id);
            return `
              <tr>
                <td>${isMe ? `<strong>${name} (You)</strong>` : name}</td>
                <td>${answered}</td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
};

const renderEarnings = (payload) => {
  const el = document.querySelector('[data-earnings]');
  if (!el) return;
  const me = payload.me || {};
  const currency = me.currency || 'R$';
  const pay = Number(me.pay_per_ticket || 0) || 0;
  const claimed = Number(me.claimed_tickets || 0) || 0;
  const answered = Number(me.answered_tickets || 0) || 0;
  const bonus = Number(me.bonus_total || 0) || 0;
  const earnings = Number(me.earnings || 0) || 0;
  el.innerHTML = `
    <div class="inline" style="margin-right: 0;">
      <span class="pill">Answered: ${answered}</span>
      <span class="pill">Claimed: ${claimed}</span>
      <span class="pill">Bonus: ${currency}${bonus}</span>
    </div>
    <div style="margin-top: 10px;">
      <div class="muted">Pay rate</div>
      <div style="font-weight: 800; font-size: 18px;">${currency}${pay} per ticket</div>
    </div>
    <div style="margin-top: 10px;">
      <div class="muted">Total earnings (this month)</div>
      <div style="font-weight: 900; font-size: 24px;">${currency}${earnings}</div>
    </div>
  `;
};

const loadDashboardStats = async () => {
  const leaderboardEl = document.querySelector('[data-leaderboard]');
  const earningsEl = document.querySelector('[data-earnings]');
  if (!leaderboardEl || !earningsEl) return;

  const res = await fetch('/api/staff/leaderboard');
  if (res.status === 401 || res.status === 403) {
    leaderboardEl.textContent = 'Please login as staff to view this.';
    earningsEl.textContent = 'Please login as staff to view this.';
    return;
  }
  if (!res.ok) {
    leaderboardEl.textContent = 'Unable to load leaderboard.';
    earningsEl.textContent = 'Unable to load earnings.';
    return;
  }
  const data = await safeJson(res);
  if (!data) {
    leaderboardEl.textContent = 'Unable to load leaderboard.';
    earningsEl.textContent = 'Unable to load earnings.';
    return;
  }
  renderLeaderboard(data);
  renderEarnings(data);
};

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardStats();
  loadNotifications();
});
