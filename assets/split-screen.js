/**
 * SportsHeart Web - Split Screen Module
 * Only active on scoreboard pages.
 * "Add 2nd Screen" button creates a side-by-side layout:
 *   Top: single navbar spanning full width
 *   Below: left (scoreboard) | handle | right (iframe)
 */

(function () {
  "use strict";

  var SPLIT_KEY = "sportsheart_split_view";

  // ── Never run inside an iframe (the 2nd screen itself) ──────────────────
  try {
    if (window !== window.top) return;
  } catch (e) {
    return;
  }

  // ── Only activate on scoreboard pages ───────────────────────────────────
  // The site serves clean URLs (`/mlb/scoreboard`), while the raw file is
  // `scoreboard.html`. Both forms are accepted: the extensionless URL is what
  // the address bar shows, but the `.html` path is still reachable directly and
  // is what a local static server (Live Server, file://) will give us.
  function isScoreboardPage() {
    var path = window.location.pathname;
    return /(^|\/)scoreboard(\.html)?$/i.test(path);
  }

  if (!isScoreboardPage()) return;

  // ── Create floating button ──────────────────────────────────────────────
  function createSplitButton() {
    var btn = document.createElement("button");
    btn.id = "sh-split-btn";
    btn.className = "sh-split-btn";
    btn.innerHTML =
      '<span class="sh-split-btn-icon">▶</span><span class="sh-split-btn-text">Add 2nd Screen</span>';
    btn.addEventListener("click", toggleSplitView);
    document.body.appendChild(btn);
    updateButtonState();
  }

  function updateButtonState() {
    var btn = document.getElementById("sh-split-btn");
    if (!btn) return;
    var active = isSplitActive();
    btn.innerHTML = active
      ? '<span class="sh-split-btn-icon">◀</span><span class="sh-split-btn-text">Remove 2nd Screen</span>'
      : '<span class="sh-split-btn-icon">▶</span><span class="sh-split-btn-text">Add 2nd Screen</span>';
    if (active) btn.classList.add("active");
    else btn.classList.remove("active");
  }

  function isSplitActive() {
    return !!document.getElementById("sh-split-wrapper");
  }

  // ── Toggle split view ───────────────────────────────────────────────────
  function toggleSplitView() {
    if (isSplitActive()) {
      deactivateSplit();
    } else {
      activateSplit();
    }
  }

  function activateSplit() {
    // Find the navbar — keep it outside the split
    var navbar = document.querySelector(".navbar");

    // Create wrapper (goes below navbar)
    var wrapper = document.createElement("div");
    wrapper.id = "sh-split-wrapper";
    wrapper.className = "sh-split-wrapper";

    // Create left panel
    var leftPanel = document.createElement("div");
    leftPanel.id = "sh-left-panel";
    leftPanel.className = "sh-left-panel";

    // Move body children into left panel, EXCEPT: navbar, button, modals, wrapper
    var children = Array.from(document.body.children);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (
        child === navbar ||
        child.id === "sh-split-btn" ||
        child.id === "sh-split-wrapper" ||
        child.id === "auth-modal" ||
        child.id === "sbPlayerModal" ||
        child.id === "sbPlayModal" ||
        child.id === "sbStreamModal" ||
        child.classList.contains("sb-modal-overlay") ||
        child.classList.contains("sb-stream-overlay") ||
        child.classList.contains("modal-overlay")
      ) {
        continue;
      }
      leftPanel.appendChild(child);
    }

    wrapper.appendChild(leftPanel);

    // Create resize handle
    var handle = document.createElement("div");
    handle.id = "sh-resize-handle";
    handle.className = "sh-resize-handle";
    wrapper.appendChild(handle);

    // Create right panel with iframe
    var rightPanel = document.createElement("div");
    rightPanel.id = "sh-right-panel";
    rightPanel.className = "sh-right-panel";

    var iframe = document.createElement("iframe");
    iframe.id = "sh-right-iframe";
    iframe.src = "/";
    iframe.className = "sh-right-iframe";
    rightPanel.appendChild(iframe);

    wrapper.appendChild(rightPanel);

    // Insert wrapper after navbar (or at top if no navbar)
    if (navbar && navbar.parentNode === document.body) {
      document.body.insertBefore(wrapper, navbar.nextSibling);
    } else {
      document.body.insertBefore(wrapper, document.body.firstChild);
    }

    // Setup resize
    setupResizeHandle(handle, leftPanel, rightPanel, iframe);

    // Confine left-screen modals to the left panel area
    document.body.classList.add("sh-split-active");
    updateRightWidthVar(rightPanel);

    // Notify scoreboard to collapse panels
    window.dispatchEvent(new CustomEvent("sh-split-activated"));
    updateButtonState();
    try {
      localStorage.setItem(SPLIT_KEY, "1");
    } catch (e) {}
  }

  // Track the right panel width so CSS can confine left-screen modals
  function updateRightWidthVar(rightPanel) {
    if (!rightPanel) return;
    var w = rightPanel.offsetWidth;
    document.documentElement.style.setProperty("--sh-right-width", w + "px");
  }

  function deactivateSplit() {
    var wrapper = document.getElementById("sh-split-wrapper");
    if (!wrapper) return;

    var leftPanel = document.getElementById("sh-left-panel");
    if (leftPanel) {
      var navbar = document.querySelector(".navbar");
      // Move children back to body, inserting before wrapper
      var children = Array.from(leftPanel.children);
      for (var i = 0; i < children.length; i++) {
        document.body.insertBefore(children[i], wrapper);
      }
    }

    wrapper.remove();
    document.body.classList.remove("sh-split-active");
    document.documentElement.style.removeProperty("--sh-right-width");
    window.dispatchEvent(new CustomEvent("sh-split-deactivated"));
    updateButtonState();
    try {
      localStorage.removeItem(SPLIT_KEY);
    } catch (e) {}
  }

  // ── Resize handle ───────────────────────────────────────────────────────
  function setupResizeHandle(handle, leftPanel, rightPanel, iframe) {
    var startX = 0,
      startWidth = 0;
    var overlay = null;

    handle.addEventListener("mousedown", function (e) {
      e.preventDefault();
      startX = e.clientX;
      startWidth = rightPanel.offsetWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      // Create transparent overlay over iframe to prevent it from capturing mouse events
      overlay = document.createElement("div");
      overlay.className = "sh-resize-overlay";
      overlay.style.cssText =
        "position:absolute;inset:0;z-index:5;cursor:col-resize;";
      rightPanel.appendChild(overlay);

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    function onMove(ev) {
      var dx = startX - ev.clientX;
      var newWidth = Math.max(
        350,
        Math.min(window.innerWidth * 0.65, startWidth + dx),
      );
      rightPanel.style.width = newWidth + "px";
      leftPanel.style.width = "calc(100% - " + (newWidth + 8) + "px)";
      document.documentElement.style.setProperty(
        "--sh-right-width",
        newWidth + "px",
      );
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
    }
  }

  // ── Restore state on load ───────────────────────────────────────────────
  function restoreState() {
    try {
      if (localStorage.getItem(SPLIT_KEY) === "1") {
        setTimeout(activateSplit, 300);
      }
    } catch (e) {}
  }

  // ── Init ────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      createSplitButton();
      restoreState();
    });
  } else {
    createSplitButton();
    restoreState();
  }
})();
