(function () {
  const SHOW_MASTERED_KEY = "enWords.showMastered";
  const STORAGE_PREFIX = "enWords.level.";
  const LEVELS = [0, 1, 2, 3, 4, 5];
  const SWIPE_THRESHOLD = 58;
  let activeMenu = null;

  function pageKey() {
    return decodeURIComponent(location.pathname.split("/").pop() || "index");
  }

  function normalizeLabel(text) {
    return (text || "")
      .replace(/^\s*\d+\.\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function itemLabel(item) {
    const node = item.querySelector(".word, .en, summary .word, summary");
    return normalizeLabel(node ? node.textContent : item.textContent.slice(0, 60));
  }

  function storageKey(label) {
    return STORAGE_PREFIX + pageKey() + "." + label;
  }

  function getLevel(label) {
    const raw = localStorage.getItem(storageKey(label));
    const level = Number(raw);
    return Number.isInteger(level) && level >= 0 && level <= 5 ? level : 0;
  }

  function setLevel(item, label, level) {
    localStorage.setItem(storageKey(label), String(level));
    applyLevel(item, level);
  }

  function showMastered() {
    return localStorage.getItem(SHOW_MASTERED_KEY) === "1";
  }

  function applyLevel(item, level) {
    LEVELS.forEach((value) => item.classList.remove("study-level-" + value));
    item.classList.add("study-level-" + level);
    item.dataset.studyLevel = String(level);
    item.classList.toggle("study-hide-mastered", level === 5 && !showMastered());
    const badge = item.querySelector(".study-badge");
    if (badge) {
      badge.textContent = String(level);
      badge.setAttribute("aria-label", "熟悉程度 " + level);
    }
  }

  function closeMenu() {
    if (activeMenu) {
      const holder = activeMenu.closest(".study-item");
      if (holder) holder.classList.remove("study-menu-open");
      activeMenu.remove();
      activeMenu = null;
    }
  }

  function openMenu(item, label) {
    closeMenu();
    const surface = item.matches("details") ? item.querySelector("summary") || item : item;
    const current = getLevel(label);
    const menu = document.createElement("div");
    menu.className = "study-level-menu";
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", "选择熟悉程度");
    LEVELS.forEach((level) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(level);
      button.setAttribute("aria-pressed", String(level === current));
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setLevel(item, label, level);
        closeMenu();
      });
      menu.appendChild(button);
    });
    surface.appendChild(menu);
    item.classList.add("study-menu-open");
    activeMenu = menu;
  }

  function ensureBadge(item, label) {
    const surface = item.matches("details") ? item.querySelector("summary") || item : item;
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "study-badge";
    badge.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(item, label);
    });
    surface.insertBefore(badge, surface.firstChild);
  }

  function bindSwipe(item, label) {
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let swiped = false;

    function start(clientX, clientY) {
      startX = clientX;
      startY = clientY;
      dragging = true;
      swiped = false;
    }

    function move(clientX, clientY) {
      if (!dragging) return;
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (Math.abs(dx) < 16 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      item.classList.toggle("study-swipe-left", dx < -SWIPE_THRESHOLD / 2);
      item.classList.toggle("study-swipe-right", dx > SWIPE_THRESHOLD / 2);
    }

    function finish(clientX, clientY) {
      if (!dragging) return;
      dragging = false;
      const dx = clientX - startX;
      const dy = clientY - startY;
      item.classList.remove("study-swipe-left", "study-swipe-right");
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      swiped = true;
      if (dx < 0) {
        setLevel(item, label, 5);
        closeMenu();
      } else {
        openMenu(item, label);
      }
    }

    item.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".study-badge, .study-level-menu")) return;
      start(event.clientX, event.clientY);
      if (item.setPointerCapture && event.pointerId != null) {
        item.setPointerCapture(event.pointerId);
      }
    });

    item.addEventListener("pointermove", (event) => {
      move(event.clientX, event.clientY);
    });

    item.addEventListener("pointerup", (event) => finish(event.clientX, event.clientY));
    item.addEventListener("pointercancel", () => {
      dragging = false;
      item.classList.remove("study-swipe-left", "study-swipe-right");
    });

    item.addEventListener("touchstart", (event) => {
      if (event.target.closest(".study-badge, .study-level-menu") || event.touches.length !== 1) return;
      const touch = event.touches[0];
      start(touch.clientX, touch.clientY);
    }, { passive: true });

    item.addEventListener("touchmove", (event) => {
      if (!dragging || event.touches.length !== 1) return;
      const touch = event.touches[0];
      move(touch.clientX, touch.clientY);
    }, { passive: true });

    item.addEventListener("touchend", (event) => {
      const touch = event.changedTouches[0];
      if (touch) finish(touch.clientX, touch.clientY);
    });

    item.addEventListener("click", (event) => {
      if (event.target.closest(".study-badge, .study-level-menu")) return;
      if (!swiped) return;
      swiped = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function insertToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className = "study-toolbar is-expanded";
    toolbar.innerHTML = '<button type="button" class="study-toolbar-toggle" aria-expanded="true">设置</button><div class="study-toolbar-panel"><label><input type="checkbox" id="study-show-mastered">显示程度 5</label><span class="study-hint">左滑记住，右滑评分</span></div>';
    const input = toolbar.querySelector("input");
    const toggle = toolbar.querySelector(".study-toolbar-toggle");
    let manualStickyExpanded = false;

    function setCollapsed(collapsed) {
      toolbar.classList.toggle("is-collapsed", collapsed);
      toolbar.classList.toggle("is-expanded", !collapsed);
      if (collapsed) toolbar.classList.remove("is-sticky-expanded");
      toggle.setAttribute("aria-expanded", String(!collapsed));
    }

    function syncStickyState() {
      const atTop = window.scrollY < 24;
      toolbar.classList.toggle("is-sticky-expanded", !atTop && !toolbar.classList.contains("is-collapsed"));
      if (atTop) {
        manualStickyExpanded = false;
        setCollapsed(false);
        toolbar.classList.remove("is-sticky-expanded");
      } else if (!manualStickyExpanded) {
        setCollapsed(true);
      }
    }

    input.checked = showMastered();
    input.addEventListener("change", () => {
      localStorage.setItem(SHOW_MASTERED_KEY, input.checked ? "1" : "0");
      document.querySelectorAll(".study-item").forEach((item) => applyLevel(item, Number(item.dataset.studyLevel || 0)));
    });
    toggle.addEventListener("click", () => {
      const willExpand = toolbar.classList.contains("is-collapsed");
      manualStickyExpanded = willExpand;
      setCollapsed(!willExpand);
      toolbar.classList.toggle("is-sticky-expanded", willExpand && window.scrollY >= 24);
    });
    const h1 = document.querySelector("h1");
    if (h1 && h1.parentNode) {
      h1.insertAdjacentElement("afterend", toolbar);
    } else {
      document.body.insertBefore(toolbar, document.body.firstChild);
    }
    syncStickyState();
    window.addEventListener("scroll", syncStickyState, { passive: true });
  }

  function insertBackTop() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "study-back-top";
    button.textContent = "↑";
    button.setAttribute("aria-label", "回到顶部");
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "auto" }));
    document.body.appendChild(button);
  }

  function init() {
    const items = Array.from(document.querySelectorAll("details, .vocab, .phrase"));
    if (!items.length) return;
    insertToolbar();
    items.forEach((item, index) => {
      const label = itemLabel(item) || "item-" + index;
      item.classList.add("study-item");
      item.dataset.studyLabel = label;
      ensureBadge(item, label);
      applyLevel(item, getLevel(label));
      bindSwipe(item, label);
    });
    insertBackTop();
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".study-level-menu, .study-badge")) closeMenu();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
