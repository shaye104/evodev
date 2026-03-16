const loadSettings = async () => {
  const res = await fetch('/api/admin/integrations');
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  const form = document.querySelector('[data-integrations-form]');
  if (!form) return;
  form.querySelector('input[name="PAYHIP_API_KEY"]').value =
    data.settings?.PAYHIP_API_KEY || '';
  form.querySelector('input[name="DISCORD_WEBHOOK_URL"]').value =
    data.settings?.DISCORD_WEBHOOK_URL || '';
};

const saveSettings = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const statusEl = document.querySelector('[data-save-status]');
  const submit = form.querySelector('button[type="submit"]');
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Saving...';
  }
  if (statusEl) statusEl.textContent = '';

  const payload = {
    PAYHIP_API_KEY: String(
      form.querySelector('input[name="PAYHIP_API_KEY"]')?.value || ''
    ).trim(),
    DISCORD_WEBHOOK_URL: String(
      form.querySelector('input[name="DISCORD_WEBHOOK_URL"]')?.value || ''
    ).trim(),
  };

  const res = await fetch('/api/admin/integrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (submit) {
    submit.disabled = false;
    submit.textContent = 'Save integrations';
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (statusEl) statusEl.textContent = data.error || 'Failed to save.';
    return;
  }

  if (statusEl) statusEl.textContent = 'Saved.';
  await loadSettings();
};

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('[data-integrations-form]');
  if (form) {
    form.addEventListener('submit', saveSettings);
  }
  loadSettings();
});
