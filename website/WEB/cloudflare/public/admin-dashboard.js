(() => {
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

  const hasPermission = (staff, permission) => {
    if (!staff) return false;
    if (staff.is_admin) return true;
    const perms = parsePermissions(staff.permissions);
    if (perms.includes('*')) return true;
    return perms.includes(permission);
  };

  const getAnyAdminPerms = (staff) => {
    if (!staff) return [];
    const perms = parsePermissions(staff.permissions);
    return perms.filter((p) => String(p || '').startsWith('admin.'));
  };

  const hrefToPerm = (href) => {
    const path = String(href || '').trim();
    if (path.endsWith('/admin-panels.html') || path === '/admin-panels.html') return 'admin.panels';
    if (path.endsWith('/admin-statuses.html') || path === '/admin-statuses.html') return 'admin.statuses';
    if (path.endsWith('/admin-staff.html') || path === '/admin-staff.html') return 'admin.staff';
    if (path.endsWith('/admin-roles.html') || path === '/admin-roles.html') return 'admin.roles';
    if (path.endsWith('/admin-audit.html') || path === '/admin-audit.html') return 'admin.audit';
    return null;
  };

  const formatInt = (value) => {
    const n = Number(value || 0) || 0;
    return n.toLocaleString('en-GB');
  };

  const formatCurrency = (value, currency = 'R$') => {
    const n = Number(value || 0) || 0;
    return `${currency}${n.toLocaleString('en-GB')}`;
  };

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

  const renderStats = (data) => {
    const ticketsBox = document.querySelector('[data-admin-stats-tickets]');
    const escalationsBox = document.querySelector('[data-admin-stats-escalations]');
    const payrollBox = document.querySelector('[data-admin-stats-payroll]');
    const panelsBody = document.querySelector('[data-admin-stats-panels]');
    const staffSummary = document.querySelector('[data-admin-stats-staff-summary]');
    const payrollTableRoot = document.querySelector('[data-admin-stats-payroll-table]');
    const breakdownBtn = document.querySelector('[data-payroll-breakdown-open]');

    if (ticketsBox) {
      const t = data?.tickets?.totals || {};
      ticketsBox.innerHTML = `
        <div class="inline" style="margin: 0; gap: 8px;">
          <span class="pill">Open ${formatInt(t.open)}</span>
          <span class="pill">Closed ${formatInt(t.closed)}</span>
          <span class="pill">Total ${formatInt(t.total)}</span>
        </div>
        <div class="muted" style="margin-top: 8px;">
          ${formatInt(t.created_month)} created, ${formatInt(t.closed_month)} closed (month).
        </div>
      `;
    }

    if (escalationsBox) {
      const e = data?.tickets?.escalations_month || {};
      const routes = Array.isArray(e.top_routes) ? e.top_routes : [];
      escalationsBox.innerHTML = `
        <div class="inline" style="margin: 0; gap: 8px;">
          <span class="pill">Events ${formatInt(e.events)}</span>
          <span class="pill">Tickets ${formatInt(e.unique_tickets)}</span>
        </div>
        ${
          routes.length
            ? `<div style="margin-top: 10px;">
                <div class="subheading">Top routes</div>
                <ul style="margin: 8px 0 0; padding-left: 18px;">
                  ${routes
                    .slice(0, 3)
                    .map(
                      (r) =>
                        `<li><span class="mono">${r.from_panel_name}</span> → <span class="mono">${r.to_panel_name}</span> <span class="muted">(${formatInt(
                          r.count
                        )})</span></li>`
                    )
                    .join('')}
                </ul>
              </div>`
            : `<div class="muted" style="margin-top: 8px;">No escalations this month.</div>`
        }
      `;
    }

    if (payrollBox) {
      const s = data?.staff?.month || {};
      payrollBox.innerHTML = `
        <div class="inline" style="margin: 0; gap: 8px;">
          <span class="pill">Due ${formatCurrency(s.due_total, s.currency || 'R$')}</span>
        </div>
        <div class="muted" style="margin-top: 8px;">
          ${formatInt(s.claimed_tickets)} claims, ${formatCurrency(s.adjustment_total, s.currency || 'R$')} adj.
        </div>
      `;
    }

    if (panelsBody) {
      const panels = Array.isArray(data?.tickets?.by_panel) ? data.tickets.by_panel : [];
      panelsBody.innerHTML = '';
      if (!panels.length) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" class="muted">No panel data.</td>';
        panelsBody.appendChild(row);
      } else {
        panels.slice(0, 6).forEach((p) => {
          const row = document.createElement('tr');
          const inactive = Number(p.panel_active || 0) !== 1;
          row.innerHTML = `
            <td>${inactive ? `<span class="muted">${p.panel_name} (inactive)</span>` : p.panel_name}</td>
            <td>${formatInt(p.open)}</td>
            <td>${formatInt(p.total)}</td>
            <td>${formatInt(p.escalations_in_month)}</td>
            <td>${formatInt(p.escalations_out_month)}</td>
          `;
          panelsBody.appendChild(row);
        });

        if (panels.length > 6) {
          const row = document.createElement('tr');
          row.innerHTML = `<td colspan="5" class="muted">Showing top 6 panels. Use “Manage panels” for the full list.</td>`;
          panelsBody.appendChild(row);
        }
      }
    }

    if (staffSummary) {
      const totals = data?.staff?.totals || {};
      const month = data?.month || '';
      staffSummary.innerHTML = `
        <div class="inline" style="margin: 0; gap: 8px;">
          <span class="pill">Active ${formatInt(totals.active)}</span>
          <span class="pill warning">Susp ${formatInt(totals.suspended)}</span>
          <span class="pill">Total ${formatInt(totals.total)}</span>
        </div>
        <div class="muted" style="margin-top: 8px;">Period: ${month}</div>
      `;
    }

    if (payrollTableRoot) {
      const canView = Boolean(data?.staff?.can_view_payroll);
      const rows = Array.isArray(data?.staff?.by_staff) ? data.staff.by_staff : [];
      if (breakdownBtn) breakdownBtn.style.display = canView ? '' : 'none';
      if (!canView) {
        payrollTableRoot.innerHTML = '';
      } else if (!rows.length) {
        payrollTableRoot.innerHTML = '<div class="muted">No staff data.</div>';
      } else {
        payrollTableRoot.innerHTML = `
          <table class="table compact">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Role</th>
                <th>Claims</th>
                <th>Replies</th>
                <th>Pay/ticket</th>
                <th>Adjust</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map((r) => {
                  const inactive = Number(r.is_active || 0) !== 1;
                  const name = inactive ? `<span class="muted">${r.display_name} (suspended)</span>` : r.display_name;
                  return `<tr>
                    <td>${name}</td>
                    <td>${r.role_name || 'Staff'}</td>
                    <td>${formatInt(r.claimed_month)}</td>
                    <td>${formatInt(r.answered_month)}</td>
                    <td>${formatCurrency(r.pay_per_ticket, 'R$')}</td>
                    <td>${formatCurrency(r.adjustment_month, 'R$')}</td>
                    <td><strong>${formatCurrency(r.due_month, 'R$')}</strong></td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        `;
      }
    }
  };

  const loadStats = async () => {
    const ticketsBox = document.querySelector('[data-admin-stats-tickets]');
    if (!ticketsBox) return;
    try {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) throw new Error('stats fetch failed');
      const data = await res.json();
      renderStats(data);
    } catch {
      // Non-fatal: keep the rest of the admin dashboard usable.
      const boxes = [
        '[data-admin-stats-tickets]',
        '[data-admin-stats-escalations]',
        '[data-admin-stats-payroll]',
        '[data-admin-stats-staff-summary]',
      ];
      boxes.forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) el.textContent = 'Unable to load stats.';
      });
    }
  };

  document.addEventListener('auth:ready', (event) => {
    const staff = event.detail?.staff || null;
    if (!staff) {
      window.location.href = '/';
      return;
    }

    const hasAdminUi =
      staff.is_admin ||
      getAnyAdminPerms(staff).length > 0 ||
      hasPermission(staff, 'staff.manage_pay');
    if (!hasAdminUi) {
      window.location.href = '/staff.html';
      return;
    }

    const tiles = Array.from(document.querySelectorAll('.tile[href]'));
    tiles.forEach((tile) => {
      const perm = hrefToPerm(tile.getAttribute('href'));
      if (!perm) return;
      if (perm === 'admin.staff') {
        tile.style.display =
          hasPermission(staff, 'admin.staff') || hasPermission(staff, 'staff.manage_pay') ? '' : 'none';
        return;
      }
      tile.style.display = hasPermission(staff, perm) ? '' : 'none';
    });

    const payrollModal = document.querySelector('[data-payroll-modal]');
    const breakdownBtn = document.querySelector('[data-payroll-breakdown-open]');
    if (breakdownBtn && payrollModal) {
      breakdownBtn.addEventListener('click', () => openModal(payrollModal));
      payrollModal.querySelectorAll('[data-modal-cancel]').forEach((btn) => {
        btn.addEventListener('click', () => closeModal(payrollModal));
      });
      payrollModal.addEventListener('click', (e) => {
        if (e.target === payrollModal) closeModal(payrollModal);
      });
      payrollModal.addEventListener('cancel', (e) => {
        e.preventDefault();
        closeModal(payrollModal);
      });
    }

    loadStats();
  });
})();
