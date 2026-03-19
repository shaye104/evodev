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
      .wrap { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000; }
      .launcher {
        appearance: none; border: 0; border-radius: 999px; cursor: pointer;
        background: #2f6fd0; color: #fff; padding: 12px 16px; font-weight: 700; font-size: 14px;
        box-shadow: 0 14px 34px rgba(18, 38, 69, 0.28);
      }
      .panel {
        width: min(420px, calc(100vw - 24px)); height: min(680px, calc(100vh - 90px));
        background: #fff; border: 1px solid #d7e3f8; border-radius: 16px;
        box-shadow: 0 18px 48px rgba(17, 32, 59, 0.34); overflow: hidden;
        display: none; flex-direction: column; margin-top: 10px;
      }
      .panel.open { display: flex; }
      .head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px; border-bottom: 1px solid #e3ecfb; background: #f8fbff;
      }
      .title { margin: 0; font-size: 14px; font-weight: 800; color: #1f3550; }
      .close {
        appearance: none; border: 0; background: transparent; color: #64748b;
        font-size: 18px; line-height: 1; padding: 2px 6px; border-radius: 8px; cursor: pointer;
      }
      .close:hover { background: #eaf1ff; color: #2a63c2; }
      .frame-wrap { flex: 1; background: #fff; }
      iframe { width: 100%; height: 100%; border: 0; background: #fff; }
      .foot {
        padding: 8px 12px; border-top: 1px solid #e3ecfb; background: #f8fbff;
        font-size: 12px;
      }
      .foot a { color: #466ca2; text-decoration: none; }
      .foot a:hover { text-decoration: underline; }
      @media (max-width: 760px) {
        .wrap { right: 10px; left: 10px; bottom: 10px; }
        .launcher { width: 100%; }
        .panel {
          width: 100%;
          height: min(74vh, 620px);
        }
      }
    </style>
    <div class="wrap">
      <button class="launcher" type="button" aria-expanded="false">${escapeHtml(cfg.launcherLabel)}</button>
      <section class="panel" aria-hidden="true">
        <div class="head">
          <h3 class="title">${escapeHtml(cfg.panelTitle)}</h3>
          <button class="close" type="button" aria-label="Close chat">×</button>
        </div>
        <div class="frame-wrap"><iframe title="Evo Support Chat"></iframe></div>
        <div class="foot"><a href="${escapeHtml(cfg.portalUrl)}" target="_blank" rel="noopener">${escapeHtml(
          cfg.openPortalLabel
        )}</a></div>
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
