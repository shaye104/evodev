(() => {
  if (window.__evoPayhipChatWidgetLoaded) return;
  window.__evoPayhipChatWidgetLoaded = true;

  const defaults = {
    launcherLabel: "Chat",
    panelTitle: "Evo Support",
    supportUrl: "https://tickets.evodev.uk/tickets.html?embed=1",
    openPortalLabel: "Open full support portal",
    portalUrl: "https://tickets.evodev.uk/tickets.html",
  };

  const cfg = { ...defaults, ...(window.EVO_PAYHIP_CHAT || {}) };
  let isOpen = false;
  let isMounted = false;

  const host = document.createElement("div");
  host.id = "evo-payhip-chat-root";
  const shadow = host.attachShadow({ mode: "open" });

  const escapeHtml = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  shadow.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; font-family: Inter, ui-sans-serif, -apple-system, Segoe UI, sans-serif; }
      .wrap { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; }
      .launcher {
        appearance: none;
        border: 1px solid #d1deef;
        border-radius: 999px;
        cursor: pointer;
        background: #ffffff;
        color: #2f6fd0;
        width: 56px;
        height: 56px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 14px 34px rgba(18, 38, 69, 0.22);
        transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
      }
      .launcher:hover {
        transform: translateY(-1px);
        border-color: #aac2e4;
        box-shadow: 0 16px 36px rgba(18, 38, 69, 0.26);
      }
      .launcher:active { transform: translateY(0); }
      .launcher svg {
        width: 25px;
        height: 25px;
        display: block;
      }
      .sr-only {
        position: absolute !important;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      .panel {
        width: min(540px, calc(100vw - 32px));
        height: min(680px, calc(100vh - 44px));
        background: linear-gradient(180deg, #eff4ff 0%, #f7faff 9%, #ffffff 100%);
        border: 1px solid #cbdcf4;
        border-radius: 26px;
        box-shadow: 0 22px 56px rgba(15, 34, 67, 0.34);
        overflow: hidden;
        display: none;
        flex-direction: column;
        margin-top: 10px;
      }
      .panel.open { display: flex; }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px 14px;
        border-bottom: 1px solid #d9e6fb;
        background: linear-gradient(180deg, #2f6fd0 0%, #3273d4 100%);
      }
      .title {
        margin: 0;
        font-size: 15px;
        letter-spacing: 0.01em;
        font-weight: 800;
        color: #ffffff;
      }
      .close {
        appearance: none;
        border: 0;
        background: rgba(255, 255, 255, 0.18);
        color: #ffffff;
        font-size: 18px;
        line-height: 1;
        width: 30px;
        height: 30px;
        border-radius: 999px;
        cursor: pointer;
      }
      .close:hover { background: rgba(255, 255, 255, 0.28); }
      .frame-wrap {
        flex: 1;
        background: #ffffff;
      }
      iframe { width: 100%; height: 100%; border: 0; background: #fff; }
      @media (max-width: 760px) {
        .wrap { right: 8px; left: 8px; bottom: 8px; }
        .launcher { margin-left: auto; display: flex; }
        .panel {
          width: 100%;
          height: min(84vh, 700px);
          border-radius: 22px;
        }
      }
    </style>
    <div class="wrap">
      <button class="launcher" type="button" aria-expanded="false" aria-label="${escapeHtml(cfg.launcherLabel)}">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5.5 6.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4.5 3v-3H5.5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="9" cy="12" r="1" fill="currentColor"/>
          <circle cx="12" cy="12" r="1" fill="currentColor"/>
          <circle cx="15" cy="12" r="1" fill="currentColor"/>
        </svg>
        <span class="sr-only">${escapeHtml(cfg.launcherLabel)}</span>
      </button>
      <section class="panel" aria-hidden="true">
        <div class="head">
          <h3 class="title">${escapeHtml(cfg.panelTitle)}</h3>
          <button class="close" type="button" aria-label="Close chat">×</button>
        </div>
        <div class="frame-wrap"><iframe title="Evo Support Chat"></iframe></div>
      </section>
    </div>
  `;

  const launcher = shadow.querySelector(".launcher");
  const panel = shadow.querySelector(".panel");
  const close = shadow.querySelector(".close");
  const frame = shadow.querySelector("iframe");

  const openPanel = () => {
    if (!isMounted) {
      frame.src = cfg.supportUrl;
      isMounted = true;
    }
    isOpen = true;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    launcher.setAttribute("aria-expanded", "true");
  };

  const closePanel = () => {
    isOpen = false;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    launcher.setAttribute("aria-expanded", "false");
  };

  launcher.addEventListener("click", () => {
    if (isOpen) closePanel();
    else openPanel();
  });

  close.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) closePanel();
  });

  const mount = () => {
    if (!document.body) return false;
    document.body.appendChild(host);
    return true;
  };

  if (!mount()) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        mount();
      },
      { once: true }
    );
  }
})();
