(function () {
  const API_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";
  const POLL_INTERVAL = 5000;

  const params = new URLSearchParams(window.location.search);
  const fixtureId = params.get("id") || params.get("fixtureId") || "19696150";
  const url = `${API_BASE}/football/game/light/${fixtureId}`;
  // optional color overrides from query string (hex without # allowed)
  function normalizeHex(h) {
    if (!h) return null;
    try {
      h = String(h).trim();
      if (!h) return null;
      if (!h.startsWith("#")) h = `#${h}`;
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h)) return h;
      return null;
    } catch (e) {
      return null;
    }
  }

  function hexToRgb(hex) {
    if (!hex) return null;
    const h = hex.replace("#", "");
    const bigint = parseInt(
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h,
      16,
    );
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }

  function rgbToHex(r, g, b) {
    return (
      "#" +
      [r, g, b]
        .map((x) =>
          Math.max(0, Math.min(255, Math.round(x)))
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  }

  function darkenHex(hex, pct) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const factor = 1 - (pct || 0.15);
    return rgbToHex(
      Math.floor(rgb[0] * factor),
      Math.floor(rgb[1] * factor),
      Math.floor(rgb[2] * factor),
    );
  }

  function blendHex(hexA, hexB, weightB) {
    // weightB: 0..1 proportion of hexB in the mix
    try {
      const a = hexToRgb(hexA || "#000000");
      const b = hexToRgb(hexB || "#000000");
      if (!a || !b) return hexA || hexB || "#000000";
      const w =
        typeof weightB === "number" ? Math.max(0, Math.min(1, weightB)) : 0.5;
      const r = Math.round(a[0] * (1 - w) + b[0] * w);
      const g = Math.round(a[1] * (1 - w) + b[1] * w);
      const bl = Math.round(a[2] * (1 - w) + b[2] * w);
      return rgbToHex(r, g, bl);
    } catch (e) {
      return hexA || hexB || "#000000";
    }
  }

  const urlHomeColor = normalizeHex(params.get("homeColor"));
  const urlAwayColor = normalizeHex(params.get("awayColor"));
  // Debugging: always enable on-screen and console logs

  // ticking state (used by the 1s local updater)
  let lastMatch = null;
  let lastSnapshotMs = 0;
  let tickingIntervalId = null;
  let widgetRevealed = false;
  // Promo banner state: every minute show promoText for promoDurationMs
  let promoActive = false;
  let promoSavedText = "";
  let promoTimeoutId = null;
  let promoScheduleTimeoutId = null;
  const promoText = "Download SportsHeart on the App Store";
  const promoDurationMs = 5000;

  function revealWidget() {
    if (widgetRevealed) return;
    try {
      const w =
        document.getElementById("scaleWrapper") ||
        document.getElementById("streamWidget");
      if (w) {
        w.classList.remove("not-ready");
        w.style.visibility = "visible";
      }
    } catch (e) {
      // ignore
    }
    widgetRevealed = true;
  }

  function safeText(s) {
    return s == null ? "" : String(s);
  }

  function pad2(n) {
    return String(Math.max(0, n)).padStart(2, "0");
  }

  function abbreviateFirst(name) {
    if (!name) return "";
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const first = parts[0];
    const rest = parts.slice(1).join(" ");
    return `${first.charAt(0)}. ${rest}`;
  }

  function getParticipantByLocation(match, loc) {
    return (
      (match.participants || []).find((p) => p.meta?.location === loc) || null
    );
  }

  function getScoreForSide(match, side) {
    // side = 'home' or 'away'
    const scores = match.scores || [];
    // Try CURRENT first
    let s = scores.find(
      (x) =>
        (x.description || "").toUpperCase() === "CURRENT" &&
        x.score?.participant === side,
    );
    if (s && s.score) return s.score.goals;
    // fallback: find first score where participant matches
    s = scores.find(
      (x) => x.score?.participant === side && typeof x.score.goals === "number",
    );
    return s ? s.score.goals : 0;
  }

  // Get score for a particular description match (eg. 'penalties')
  function getScoreForSideByDesc(match, side, descMatcher) {
    try {
      const scores = match.scores || [];
      const s = scores.find((x) => {
        const d = (x.description || "").toLowerCase();
        return (
          d.includes(descMatcher.toLowerCase()) && x.score?.participant === side
        );
      });
      return s && s.score ? s.score.goals : null;
    } catch (e) {
      return null;
    }
  }

  function formatCenterText(match) {
    // prefer ticking period
    const periods = match.periods || [];
    const ticking = periods.find((p) => p.ticking) || null;
    const state = match.state || {};
    if (ticking) {
      const desc = (ticking.description || "").toLowerCase();
      // If this ticking period is a penalties period, do not show mm:ss — show only state name
      if (desc.includes("penalt") || desc.includes("penalties")) {
        return state.name || state.short_name || "";
      }
      const m = typeof ticking.minutes === "number" ? ticking.minutes : 0;
      const s = typeof ticking.seconds === "number" ? ticking.seconds : 0;
      const short = state.short_name || "";
      return `${pad2(m)}:${pad2(s)} - ${short}`;
    }
    // Not ticking: show state name or starting_at
    if (state.name) return state.name;
    if (match.starting_at) return match.starting_at;
    return "";
  }

  // Compute ticking text based on last server snapshot + elapsed time
  function computeTickingText(match, snapshotMs) {
    try {
      const periods = match.periods || [];
      const ticking = periods.find((p) => p.ticking);
      // If the ticking period represents penalties, do not compute mm:ss — return state name
      const tickingDesc = (
        ticking &&
        (ticking.description || "")
      ).toLowerCase();
      if (tickingDesc.includes("penalt") || tickingDesc.includes("penalties")) {
        const state = match.state || {};
        return state.name || state.short_name || "";
      }
      const state = match.state || {};

      if (!ticking) return formatCenterText(match);

      const baseMinutes =
        typeof ticking.minutes === "number" ? ticking.minutes : 0;
      const baseSeconds =
        typeof ticking.seconds === "number" ? ticking.seconds : 0;

      const elapsedMs = Date.now() - (snapshotMs || Date.now());
      const elapsedSec = Math.floor(elapsedMs / 1000);

      let totalSeconds = baseMinutes * 60 + baseSeconds + elapsedSec;
      if (totalSeconds < 0) totalSeconds = 0;

      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      const short = state.short_name || state.name || "";
      return `${pad2(minutes)}:${pad2(seconds)} - ${short}`;
    } catch (e) {
      return formatCenterText(match);
    }
  }

  // Debounce helper
  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Fit a text element to its visible width by lowering font-size until it fits.
  function fitTextToWidth(el, opts = {}) {
    if (!el) return;
    try {
      const maxFontPx = opts.maxFontPx || 100;
      const minFontPx = opts.minFontPx || 10;
      const step = opts.step || 1;

      // ensure single line for measurement
      const prevWhite = el.style.whiteSpace;
      el.style.whiteSpace = "nowrap";

      // start from max and step down until it fits
      let font = maxFontPx;
      el.style.fontSize = font + "px";

      // available width is the element's clientWidth
      const available =
        el.clientWidth ||
        (el.parentElement && el.parentElement.clientWidth) ||
        0;

      // if there's no natural width to compare against, leave as-is
      if (!available) {
        el.style.whiteSpace = prevWhite;
        return;
      }

      // reduce font until scrollWidth fits inside clientWidth or min reached
      while (font > minFontPx && el.scrollWidth > available) {
        font -= step;
        el.style.fontSize = font + "px";
        // safety break
        if (font <= minFontPx) break;
      }

      // restore whiteSpace if it was not set inline previously
      el.style.whiteSpace = prevWhite;
    } catch (e) {
      // ignore measurement errors
    }
  }

  function adjustAllText() {
    try {
      // Team names
      document
        .querySelectorAll(".outer-left-text, .outer-right-text")
        .forEach((el) => {
          fitTextToWidth(el, { maxFontPx: 45, minFontPx: 27.5, step: 1 });
        });

      // Scores
      document.querySelectorAll(".left-number, .right-number").forEach((el) => {
        fitTextToWidth(el, { maxFontPx: 100, minFontPx: 24, step: 1 });
      });

      // Center ticking text
      const center = document.querySelector(".center-red-text");
      if (center)
        fitTextToWidth(center, { maxFontPx: 50, minFontPx: 10, step: 1 });

      // Top event text
      const top = document.querySelector(".top-red-text");
      if (top) fitTextToWidth(top, { maxFontPx: 30, minFontPx: 10, step: 1 });
      // Penalty score
      const pen = document.querySelector(".penalty-score");
      if (pen) fitTextToWidth(pen, { maxFontPx: 22, minFontPx: 12, step: 1 });
    } catch (e) {
      // ignore
    }
  }

  // Promo scheduling: show promo at the start of each minute for a short duration
  function triggerPromo() {
    try {
      const topEl = document.querySelector(".top-red-text");
      if (!topEl) {
        schedulePromo();
        return;
      }
      if (!promoActive) promoSavedText = topEl.textContent || "";
      promoActive = true;
      // show promo
      topEl.textContent = promoText;
      topEl.style.visibility = "visible";
      fitTextToWidth(topEl, { maxFontPx: 35, minFontPx: 10, step: 1 });

      if (promoTimeoutId) clearTimeout(promoTimeoutId);
      promoTimeoutId = setTimeout(() => {
        try {
          promoActive = false;
          const t = document.querySelector(".top-red-text");
          if (t) {
            t.textContent = promoSavedText || "";
            t.style.visibility = promoSavedText ? "visible" : "hidden";
            adjustAllText();
          }
        } catch (e) {
          console.error("promo revert error", e);
        }
        promoTimeoutId = null;
        // schedule next promo
        schedulePromo();
      }, promoDurationMs);
    } catch (e) {
      console.error("promo trigger error", e);
      schedulePromo();
    }
  }

  function schedulePromo() {
    try {
      if (promoScheduleTimeoutId) {
        clearTimeout(promoScheduleTimeoutId);
        promoScheduleTimeoutId = null;
      }
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const ms = now.getMilliseconds();
      // compute ms until the next quarter hour (0,15,30,45)
      const remainder = minutes % 15;
      const minutesUntil = remainder === 0 ? 15 : 15 - remainder;
      const msUntilNext = minutesUntil * 60 * 1000 - seconds * 1000 - ms;
      promoScheduleTimeoutId = setTimeout(() => {
        triggerPromo();
      }, Math.max(0, msUntilNext));
    } catch (e) {
      console.error("schedulePromo error", e);
    }
  }

  // Parse a server start time (assume timezone-less strings are local) and format nicely
  function formatStartTime(s) {
    if (!s) return "";
    try {
      const iso = String(s).replace(" ", "T");
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(s);
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const year = d.getFullYear();
      const month = months[d.getMonth()] || "";
      const day = d.getDate();
      let hour = d.getHours();
      const minute = String(d.getMinutes()).padStart(2, "0");
      const ampm = hour >= 12 ? "PM" : "AM";
      hour = hour % 12 || 12;
      return `${year} ${month} ${day} @ ${hour}:${minute} ${ampm}`;
    } catch (e) {
      return String(s);
    }
  }

  function formatTopEventText(match) {
    const events = (match.events || []).slice();
    if (!events.length) return null;
    // Sort by period (using match.periods order), then minute, then extra_minute
    const periodOrder = (match.periods || []).map((p) => p.id);
    events.sort((a, b) => {
      const pa = periodOrder.indexOf(a.period_id);
      const pb = periodOrder.indexOf(b.period_id);
      const ia = pa === -1 ? Number.MAX_SAFE_INTEGER : pa;
      const ib = pb === -1 ? Number.MAX_SAFE_INTEGER : pb;
      if (ia !== ib) return ia - ib;
      const ma = a.minute || 0;
      const mb = b.minute || 0;
      if (ma !== mb) return ma - mb;
      const ea = a.extra_minute || 0;
      const eb = b.extra_minute || 0;
      return ea - eb;
    });
    const ev = events[events.length - 1];
    return formatEvent(ev, match);
  }

  // Format a single event into a readable string (used for both display and logging)
  function formatEvent(ev, match) {
    if (!ev) return null;
    const home = getParticipantByLocation(match, "home");
    const away = getParticipantByLocation(match, "away");
    const team =
      ev.participant_id === home?.id
        ? home
        : ev.participant_id === away?.id
          ? away
          : null;
    const teamName = team?.name || "";

    const additionRaw = ev.addition || ev.info || "";
    const addition = String(additionRaw).toLowerCase();
    const result = ev.result || "";
    const minute = ev.minute != null ? ev.minute : "";

    // Goal detection
    if ((result && /\d-\d/.test(String(result))) || addition.includes("goal")) {
      return `${teamName} GOAL ! ⚽ ${safeText(ev.player_name)} (${safeText(result)})${minute ? ` - ${minute}'` : ""}`;
    }

    // Substitution
    if (addition.includes("sub") || addition.includes("substitution")) {
      const rel =
        abbreviateFirst(ev.related_player_name) ||
        safeText(ev.related_player_name);
      return `${teamName} SUB: 🟢 ${safeText(ev.player_name)} - 🔴 ${rel}${minute ? ` - ${minute}'` : ""}`;
    }

    // Cards
    const info = (ev.info || "").toLowerCase();
    if (addition.includes("yellow") || info.includes("yellow")) {
      return `${teamName} Yellow Card 🟨 ${safeText(ev.player_name)}${minute ? ` - ${minute}'` : ""}`;
    }
    if (addition.includes("red") || info.includes("red")) {
      return `${teamName} Red Card 🟥 ${safeText(ev.player_name)}${minute ? ` - ${minute}'` : ""}`;
    }

    // Generic fallback: team + addition + player
    const additionText = safeText(additionRaw).trim();
    const playerText = safeText(ev.player_name || "").trim();
    let prefix = teamName ? teamName : "";
    if (
      additionText &&
      teamName &&
      additionText.toLowerCase().includes(teamName.toLowerCase())
    )
      prefix = "";
    const parts = [];
    if (prefix) parts.push(prefix);
    if (additionText) parts.push(additionText);
    if (playerText) parts.push(`- ${playerText}`);
    const out = parts.join(" ").trim();
    if (out) return out;
    if (teamName) return teamName;
    if (additionText) return additionText;
    if (playerText) return playerText;
    return "Event";
  }

  // Debugging removed: no on-screen panel or verbose logs in the overlay

  function applyTopCircleColor(match, event) {
    const top = document.querySelector(".top-red-circle");
    if (!top) return;
    const home = getParticipantByLocation(match, "home");
    if (!event) {
      top.style.background = "";
      return;
    }
    const ev = event;
    // Prefer explicit team colors if provided on participant
    const team =
      (match.participants || []).find((p) => p.id === ev.participant_id) ||
      null;
    if (team && (team.colorPrimary || team.colorSecondary)) {
      const raw = team.colorPrimary || team.colorSecondary || "#082250";
      const a = normalizeHex(raw) || raw;
      const mix = blendHex(a, "#000000", 0.45);
      top.style.background = `linear-gradient(180deg, ${mix} 0%, ${a} 80%, #000000 100%)`;
      return;
    }

    // Check for URL overrides (homeColor/awayColor)
    try {
      if (ev.participant_id === home?.id && urlHomeColor) {
        const a = urlHomeColor;
        const mix = blendHex(a, "#000000", 0.45);
        top.style.background = `linear-gradient(180deg, ${mix} 0%, ${a} 80%, #000000 100%)`;
        return;
      }
      if (ev.participant_id !== home?.id && urlAwayColor) {
        const a = urlAwayColor;
        const mix = blendHex(a, "#000000", 0.45);
        top.style.background = `linear-gradient(180deg, ${mix} 0%, ${a} 80%, #000000 100%)`;
        return;
      }
    } catch (__) {}

    // Fallback: use home/away default gradients
    if (ev.participant_id === home?.id) {
      top.style.background = "linear-gradient(180deg, #082250, #0b4aa6)";
    } else {
      top.style.background = "linear-gradient(180deg, #4b0707, #c22b2b)";
    }
  }

  function updateDOM(match, opts = {}) {
    const { useServerTime = true } = opts;
    try {
      const home = getParticipantByLocation(match, "home");
      const away = getParticipantByLocation(match, "away");

      const leftImg = document.querySelector(".bar.left img");
      const rightImg = document.querySelector(".bar.right img");
      if (leftImg && home?.image_path) leftImg.src = home.image_path;
      if (rightImg && away?.image_path) rightImg.src = away.image_path;

      // Apply team/URL colors to outer pill and side bars if available
      try {
        const outerEl = document.querySelector(".outer-pill");
        const barLeft = document.querySelector(".bar.left");
        const barRight = document.querySelector(".bar.right");

        const homePrimary =
          home && (home.colorPrimary || home.colorSecondary)
            ? home.colorPrimary || home.colorSecondary
            : urlHomeColor || "#0b4aa6";
        const homeSecondary =
          home && (home.colorSecondary || home.colorPrimary)
            ? home.colorSecondary || home.colorPrimary
            : darkenHex(homePrimary, 0.18);

        const awayPrimary =
          away && (away.colorPrimary || away.colorSecondary)
            ? away.colorPrimary || away.colorSecondary
            : urlAwayColor || "#b91f1f";
        const awaySecondary =
          away && (away.colorSecondary || away.colorPrimary)
            ? away.colorSecondary || away.colorPrimary
            : darkenHex(awayPrimary, 0.18);

        if (outerEl) {
          outerEl.style.background = `linear-gradient(90deg, ${homePrimary} 0%, #000000 48%, #000000 52%, ${awayPrimary} 100%)`;
        }
        if (barLeft)
          barLeft.style.background = `linear-gradient(90deg, ${homePrimary} 0%, ${homeSecondary} 100%)`;
        if (barRight)
          barRight.style.background = `linear-gradient(270deg, ${awayPrimary} 0%, ${awaySecondary} 100%)`;
      } catch (__) {
        // ignore styling errors
      }

      const ol = document.querySelector(".outer-left-text");
      const or = document.querySelector(".outer-right-text");
      if (ol) ol.textContent = home?.name || "";
      if (or) or.textContent = away?.name || "";

      const ln = document.querySelector(".left-number");
      const rn = document.querySelector(".right-number");
      if (ln) ln.textContent = String(getScoreForSide(match, "home"));
      if (rn) rn.textContent = String(getScoreForSide(match, "away"));

      const center = document.querySelector(".center-red-text");
      // Penalties handling: if there's a penalties score set, show penalty-score
      // but keep the center-red-circle visible — only the ticking clock is suppressed elsewhere.
      const penaltyHome = getScoreForSideByDesc(match, "home", "penalt");
      const penaltyAway = getScoreForSideByDesc(match, "away", "penalt");
      const penaltyEl = document.querySelector(".penalty-score");
      if (penaltyHome != null || penaltyAway != null) {
        // show penalty text above dash
        if (penaltyEl) {
          const ph = penaltyHome != null ? penaltyHome : 0;
          const pa = penaltyAway != null ? penaltyAway : 0;
          penaltyEl.textContent = `(${ph} - ${pa})`;
          penaltyEl.style.display = "block";
        }
        // keep center area visible but show non-ticking state text (no per-second ticking)
        if (center) {
          center.textContent = formatCenterText(match);
          center.style.visibility = "visible";
        }
      } else {
        if (penaltyEl) penaltyEl.style.display = "none";
        if (center) {
          // set initial text based on server snapshot (tick will update if needed)
          if (useServerTime) center.textContent = formatCenterText(match);
          center.style.visibility = "visible";
        }
      }

      // top event
      // Determine top text. If the match is finished, prefer winner message.
      let topText = "";
      let topEvent = null;

      const finishedStates = ["FT", "AET", "FT_PEN"];
      const stateCode = (match.state && match.state.state) || "";
      if (finishedStates.includes(stateCode)) {
        // Robust winner detection:
        // 1) participant.winner or participant.is_winner flags
        // 2) match.winner_id or match.winner
        // 3) infer from final scores
        let winner = null;
        const parts = match.participants || [];
        winner = parts.find((p) =>
          p && (p.winner === true || p.winner === "true" || p.is_winner === true || p.is_winner === "true" || (p.meta && (p.meta.winner === true || p.meta.winner === "true" || p.meta.is_winner === true)))
        );
        if (!winner && typeof match.winner_id !== "undefined") {
          winner = parts.find((p) => p && p.id === match.winner_id) || null;
        }
        if (!winner && typeof match.winner !== "undefined") {
          // some feeds use match.winner as id
          winner = parts.find((p) => p && p.id === match.winner) || null;
        }
        if (!winner) {
          // infer by comparing final reported scores
          try {
            const homePart = getParticipantByLocation(match, "home");
            const awayPart = getParticipantByLocation(match, "away");
            const homeScore = Number(getScoreForSide(match, "home") || 0);
            const awayScore = Number(getScoreForSide(match, "away") || 0);
            if (homePart && awayPart) {
              if (homeScore > awayScore) winner = homePart;
              else if (awayScore > homeScore) winner = awayPart;
            }
          } catch (e) {
            // ignore
          }
        }
        if (winner) {
          topText = `${winner.name} Wins The Match!`;
          topEvent = { participant_id: winner.id };
          try {
            console.debug("stream overlay: winner detected", winner.name, winner.id);
          } catch (e) {}
        }
      }

      // If we don't have a winner message, fall back to latest event or start time
      if (!topText) {
        const events = (match.events || []).slice();
        if (events.length) {
          // Sort events by period order (match.periods), then minute, then extra_minute
          const periodOrder = (match.periods || []).map((p) => p.id);
          events.sort((a, b) => {
            const pa = periodOrder.indexOf(a.period_id);
            const pb = periodOrder.indexOf(b.period_id);
            const ia = pa === -1 ? Number.MAX_SAFE_INTEGER : pa;
            const ib = pb === -1 ? Number.MAX_SAFE_INTEGER : pb;
            if (ia !== ib) return ia - ib;
            const ma = a.minute || 0;
            const mb = b.minute || 0;
            if (ma !== mb) return ma - mb;
            const ea = a.extra_minute || 0;
            const eb = b.extra_minute || 0;
            return ea - eb;
          });
          topEvent = events[events.length - 1];
          topText = formatEvent(topEvent, match);
        }
        // If there is no top event, show the match start time instead
        if (!topText && match.starting_at) {
          try {
            topText = `${formatStartTime(match.starting_at)}`;
          } catch (e) {
            topText = "";
          }
        }
      }
      const topEl = document.querySelector(".top-red-text");
      if (topEl) {
        if (promoActive) {
          // while promoActive, keep the promo text visible and do not overwrite
          topEl.style.visibility = "visible";
        } else {
          if (topText) {
            topEl.textContent = topText;
            topEl.style.visibility = "visible";
          } else {
            topEl.textContent = "";
            topEl.style.visibility = "hidden";
          }
        }
      }
      applyTopCircleColor(match, topEvent);
      // adjust fonts to fit their containers after changing text
      adjustAllText();
    } catch (e) {
      console.error("updateDOM error", e);
    }
  }

  async function fetchAndUpdate() {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const json = await resp.json();
      const match = json?.data?.fixtureData || json?.fixtureData || json?.data;
      if (match) {
        // Decide whether to accept the server snapshot for ticking
        const periods = match.periods || [];
        const serverTicking = periods.find((p) => p.ticking);
        const serverTotalSeconds = serverTicking
          ? Number(serverTicking.minutes || 0) * 60 +
            Number(serverTicking.seconds || 0)
          : null;

        // compute local total seconds based on lastMatch + elapsed, if available
        let localTotalSeconds = null;
        if (lastMatch) {
          try {
            const lp = (lastMatch.periods || []).find((p) => p.ticking);
            if (lp) {
              const base =
                Number(lp.minutes || 0) * 60 + Number(lp.seconds || 0);
              const elapsed = Math.floor((Date.now() - lastSnapshotMs) / 1000);
              localTotalSeconds = base + elapsed;
            }
          } catch (__) {
            localTotalSeconds = null;
          }
        }

        // If server time is behind local time, do NOT overwrite local ticking snapshot
        let useServerTime = true;
        if (
          serverTotalSeconds != null &&
          localTotalSeconds != null &&
          serverTotalSeconds + 1 < localTotalSeconds
        ) {
          useServerTime = false;
        }

        // Update DOM for non-center fields always; center text only if using server time
        updateDOM(match, { useServerTime });

        // Reveal widget now that we have valid data (prevents initial flicker)
        revealWidget();

        // If we're accepting server snapshot for ticking, store it as the base
        if (useServerTime || !lastMatch) {
          lastMatch = match;
          lastSnapshotMs = Date.now();
        }

        // manage ticking interval: ensure a 1s updater runs when a ticking period is active
        // but suppress ticking if the match is in a penalties score state
        const hasPenalties = (match.scores || []).some((x) => {
          const d = (x.description || "").toLowerCase();
          return d.includes("penalt");
        });

        const ticking =
          (!hasPenalties &&
            (serverTicking ||
              ((lastMatch || {}).periods || []).find((p) => p.ticking))) ||
          null;
        if (ticking) {
          if (tickingIntervalId == null) {
            // run immediately once to avoid 1s delay
            const centerElNow = document.querySelector(".center-red-text");
            if (centerElNow) {
              centerElNow.textContent = computeTickingText(
                lastMatch,
                lastSnapshotMs,
              );
              fitTextToWidth(centerElNow, { maxFontPx: 50, minFontPx: 10 });
            }

            tickingIntervalId = setInterval(() => {
              if (!lastMatch) return;
              const centerEl = document.querySelector(".center-red-text");
              if (centerEl) {
                centerEl.textContent = computeTickingText(
                  lastMatch,
                  lastSnapshotMs,
                );
                fitTextToWidth(centerEl, { maxFontPx: 50, minFontPx: 10 });
              }
            }, 1000);
          }
        } else {
          if (tickingIntervalId != null) {
            clearInterval(tickingIntervalId);
            tickingIntervalId = null;
          }
        }
      }
    } catch (e) {
      // ignore transient errors
      console.debug("fetch error", e.message);
    }
  }

  // initial fetch + interval
  fetchAndUpdate();
  setInterval(fetchAndUpdate, POLL_INTERVAL);

  // start promo scheduling (shows promo at start of each minute for a short duration)
  schedulePromo();

  // Reflow text on window resize (debounced)
  window.addEventListener("resize", debounce(adjustAllText, 120));
})();
