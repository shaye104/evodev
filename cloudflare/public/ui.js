(() => {
  const state = {
    user: null,
    staff: null,
  };

  const parseDateTime = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    // Unix timestamps (seconds or ms)
    if (typeof value === 'number' && Number.isFinite(value)) {
      const ms = value < 1e12 ? value * 1000 : value;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    if (typeof value !== 'string') return null;
    const s = value.trim();
    if (!s) return null;

    if (/^\d+$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n)) {
        const ms = n < 1e12 ? n * 1000 : n;
        const d = new Date(ms);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }

    // SQLite-ish "YYYY-MM-DD HH:MM:SS[.sss]" (no timezone): treat as UTC.
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
      const d = new Date(s.replace(' ', 'T') + 'Z');
      if (!Number.isNaN(d.getTime())) return d;
    }

    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const formatDateTime = (value, opts = {}) => {
    const d = parseDateTime(value);
    if (!d) return value || '';

    const locale =
      opts.locale ||
      document.documentElement.getAttribute('lang') ||
      'en-GB';

    // Deliberately omit seconds/milliseconds for readability.
    const formatter = new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return formatter.format(d);
  };

  const updateNav = () => {
    document.querySelectorAll('[data-auth="user"]').forEach((el) => {
      el.style.display = state.user ? '' : 'none';
    });
    document.querySelectorAll('[data-auth="guest"]').forEach((el) => {
      el.style.display = state.user ? 'none' : '';
    });
    document.querySelectorAll('[data-auth="staff"]').forEach((el) => {
      el.style.display = state.staff ? '' : 'none';
    });
    document.querySelectorAll('[data-auth="admin"]').forEach((el) => {
      el.style.display = state.staff?.is_admin ? '' : 'none';
    });
  };

  const fetchMe = async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      state.user = data.user;
      state.staff = data.staff;
      updateNav();
      document.dispatchEvent(
        new CustomEvent('auth:ready', { detail: { user: state.user, staff: state.staff } })
      );
    } catch {
      updateNav();
    }
  };

  document.addEventListener('DOMContentLoaded', fetchMe);
  window.__supportState = state;
  window.supportParseDateTime = parseDateTime;
  window.supportFormatDateTime = formatDateTime;
})();
