const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

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
  const earnings = Number(me.earnings || 0) || 0;
  el.innerHTML = `
    <div class="inline" style="margin-right: 0;">
      <span class="pill">Answered: ${answered}</span>
      <span class="pill">Claimed: ${claimed}</span>
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
});

