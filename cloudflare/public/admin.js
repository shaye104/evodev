window.addEventListener('DOMContentLoaded', () => {
  const openModal = (modal) => {
    if (!modal) return;
    const selected = getSelectedValues(modal);
    modal.dataset.initial = JSON.stringify(selected);
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

  const toggleOption = (button, force) => {
    if (!button) return;
    const isActive = force !== undefined ? force : !button.classList.contains('is-active');
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
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
      return;
    }

    const cancelButton = event.target.closest('[data-modal-cancel]');
    if (cancelButton) {
      const modal = cancelButton.closest('[data-permissions-modal]');
      restoreModalSelections(modal);
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
      modal.dataset.initial = JSON.stringify(values);
      closeModal(modal);
      return;
    }

    const optionButton = event.target.closest('[data-permission-option]');
    if (optionButton) {
      toggleOption(optionButton);
      return;
    }

    const modal = event.target.closest('[data-permissions-modal]');
    if (modal && event.target === modal) {
      restoreModalSelections(modal);
      closeModal(modal);
    }
  });
});
