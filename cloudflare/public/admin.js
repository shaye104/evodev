window.addEventListener('DOMContentLoaded', () => {
  const openModal = (modal) => {
    if (!modal) return;
    const selected = getSelectedValues(modal);
    modal.dataset.initial = JSON.stringify(selected);
    modal.setAttribute('aria-hidden', 'false');
    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      // Safari/older browsers without <dialog>.showModal support.
      modal.setAttribute('open', '');
      modal.classList.add('open');
    }
  };

  const closeModal = (modal) => {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    if (typeof modal.close === 'function') {
      modal.close();
    } else {
      modal.removeAttribute('open');
      modal.classList.remove('open');
    }
  };

  const toggleOption = (button, force) => {
    if (!button) return;
    const isActive = force !== undefined ? force : !button.classList.contains('is-active');
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  };

  const syncAdminToggleUi = (form, modal, forceValue) => {
    if (!form || !modal) return;
    const hidden = form.querySelector('input[name="is_admin"]');
    const btn = modal.querySelector('[data-admin-toggle]');
    if (!hidden || !btn) return;

    const nextValue =
      forceValue !== undefined
        ? String(forceValue)
        : String(hidden.value || '0');

    const isOn = nextValue === '1';
    hidden.value = isOn ? '1' : '0';
    btn.textContent = `Admin access: ${isOn ? 'ON' : 'OFF'}`;
    btn.classList.toggle('secondary', !isOn);
    toggleOption(btn, isOn);
  };

  const getSelectedValues = (modal) =>
    Array.from(modal.querySelectorAll('[data-permission-option].is-active')).map(
      (btn) => btn.dataset.permissionValue
    );

  const getSummaryConfig = (modal) => {
    const cfg = {
      targetInputName: 'permissions',
      emptyLabel: 'None selected',
      selectedLabel: '{n} selected',
    };
    if (!modal) return cfg;
    if (modal.dataset.targetInput) cfg.targetInputName = modal.dataset.targetInput;
    if (modal.dataset.emptyLabel) cfg.emptyLabel = modal.dataset.emptyLabel;
    if (modal.dataset.selectedLabel) cfg.selectedLabel = modal.dataset.selectedLabel;
    return cfg;
  };

  const formatSelectedLabel = (tpl, count) => {
    if (!tpl) return `${count} selected`;
    return tpl.replace('{n}', String(count));
  };

  const restoreModalSelections = (modal) => {
    if (!modal?.dataset?.initial) return;
    let initial = [];
    try {
      initial = JSON.parse(modal.dataset.initial);
    } catch {
      initial = [];
    }
    modal.querySelectorAll('[data-permission-option]').forEach((btn) => {
      toggleOption(btn, initial.includes(btn.dataset.permissionValue));
    });
  };

  document.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-permissions-button]');
    if (openButton) {
      const form = openButton.closest('form');
      if (!form) return;
      const modal = form.querySelector('[data-permissions-modal]');
      openModal(modal);

      // Capture and sync the admin toggle (if present for this modal).
      const hiddenAdmin = form.querySelector('input[name="is_admin"]');
      if (modal && hiddenAdmin) {
        modal.dataset.initialAdmin = String(hiddenAdmin.value || '0') === '1' ? '1' : '0';
        syncAdminToggleUi(form, modal, modal.dataset.initialAdmin);
      }
      return;
    }

    const cancelButton = event.target.closest('[data-modal-cancel]');
    if (cancelButton) {
      const modal = cancelButton.closest('[data-permissions-modal]');
      restoreModalSelections(modal);
      const form = cancelButton.closest('form');
      if (form && modal?.dataset?.initialAdmin !== undefined) {
        syncAdminToggleUi(form, modal, modal.dataset.initialAdmin);
      }
      closeModal(modal);
      return;
    }

    const applyButton = event.target.closest('[data-modal-apply]');
    if (applyButton) {
      const modal = applyButton.closest('[data-permissions-modal]');
      const form = applyButton.closest('form');
      if (!modal || !form) return;
      const cfg = getSummaryConfig(modal);
      const hidden = form.querySelector(`input[name="${cfg.targetInputName}"]`);
      const summary = form.querySelector('[data-permissions-summary]');
      const values = getSelectedValues(modal);
      if (hidden) hidden.value = values.join(', ');
      if (summary) {
        summary.textContent = values.length
          ? formatSelectedLabel(cfg.selectedLabel, values.length)
          : cfg.emptyLabel;
      }

      // Persist the admin toggle (if present for this modal).
      const adminBtn = modal.querySelector('[data-admin-toggle]');
      const adminHidden = form.querySelector('input[name="is_admin"]');
      if (adminBtn && adminHidden) {
        const isOn = adminBtn.classList.contains('is-active');
        adminHidden.value = isOn ? '1' : '0';
        modal.dataset.initialAdmin = adminHidden.value;
        syncAdminToggleUi(form, modal, adminHidden.value);
      }

      modal.dataset.initial = JSON.stringify(values);
      closeModal(modal);
      return;
    }

    const optionButton = event.target.closest('[data-permission-option]');
    if (optionButton) {
      toggleOption(optionButton);
      return;
    }

    const adminToggle = event.target.closest('[data-admin-toggle]');
    if (adminToggle) {
      toggleOption(adminToggle);
      const modal = adminToggle.closest('[data-permissions-modal]');
      const form = adminToggle.closest('form');
      if (form && modal) {
        const isOn = adminToggle.classList.contains('is-active');
        syncAdminToggleUi(form, modal, isOn ? '1' : '0');
      }
      return;
    }

    const modal = event.target.closest('[data-permissions-modal]');
    if (modal && event.target === modal) {
      restoreModalSelections(modal);
      const form = modal.closest('form');
      if (form && modal?.dataset?.initialAdmin !== undefined) {
        syncAdminToggleUi(form, modal, modal.dataset.initialAdmin);
      }
      closeModal(modal);
    }
  });
});
