(() => {
  const state = {
    user: null,
    staff: null,
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
})();
