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

  document.addEventListener('auth:ready', (event) => {
    const staff = event.detail?.staff || null;
    if (!staff) {
      window.location.href = '/';
      return;
    }

    if (!staff.is_admin && getAnyAdminPerms(staff).length === 0) {
      window.location.href = '/staff.html';
      return;
    }

    const tiles = Array.from(document.querySelectorAll('.tile[href]'));
    tiles.forEach((tile) => {
      const perm = hrefToPerm(tile.getAttribute('href'));
      if (!perm) return;
      tile.style.display = hasPermission(staff, perm) ? '' : 'none';
    });
  });
})();

