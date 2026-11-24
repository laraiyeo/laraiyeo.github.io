/**
 * SportsHeart Web - Live Tracker Viewer
 * Mirrors the app's PresenceService exactly:
 * - Reads from:  presence/games/{gameId}/viewerCount
 * - Writes to:   presence/games/{gameId}/viewers/{userId}
 * - Increments:  presence/games/{gameId}/viewerCount
 */

var LiveTrackerViewer = (function () {
  var _counts = {};
  var _listeners = [];
  var _db = null;
  var _initialized = false;
  var _gameRefs = {};
  var _userId = null;

  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyBAbBZyb3ENGpALGXTwErYNL2iJo5nr6A4",
    authDomain: "live-sports-tracker-chat.firebaseapp.com",
    projectId: "live-sports-tracker-chat",
    databaseURL: "https://live-sports-tracker-chat-default-rtdb.firebaseio.com",
    storageBucket: "live-sports-tracker-chat.firebasestorage.app",
    messagingSenderId: "228719774397",
    appId: "1:228719774397:web:66321ba2003c060fdc05d4",
  };

  function getUserId() {
    if (_userId) return _userId;
    try {
      _userId = localStorage.getItem("presence_user_id");
      if (!_userId) {
        _userId =
          "web_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("presence_user_id", _userId);
      }
    } catch (e) {
      _userId =
        "web_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    }
    return _userId;
  }

  function initFirebase() {
    if (_initialized) return;
    _initialized = true;

    var scripts = [
      "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
      "https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js",
    ];

    var loaded = 0;
    function tryInit() {
      loaded++;
      if (loaded === scripts.length) {
        try {
          if (!firebase.apps || !firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
          }
          _db = firebase.database();
        } catch (e) {
          console.warn("LiveTracker: Firebase init error", e.message);
        }
      }
    }
    scripts.forEach(function (src) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = tryInit;
      script.onerror = function () {
        console.warn("LiveTracker: Failed to load Firebase SDK: " + src);
        tryInit();
      };
      document.head.appendChild(script);
    });
  }

  function formatCount(count) {
    if (!count || count === 0) return "0";
    if (count >= 1000000)
      return (count / 1000000).toFixed(2).replace(/\.00$/, "") + "M";
    if (count >= 1000)
      return (count / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(count);
  }

  function onChange(fn) {
    _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(function (l) {
        return l !== fn;
      });
    };
  }

  function _notify(gameId, count) {
    _counts[gameId] = count;
    _listeners.forEach(function (fn) {
      fn({ gameId: gameId, count: count });
    });
  }

  function startPolling(sport, gameId, intervalMs) {
    _startPollingInternal(sport, gameId, false);
  }

  function startPollingAndRecord(sport, gameId, intervalMs) {
    _startPollingInternal(sport, gameId, true);
  }

  function _startPollingInternal(sport, gameId, recordView) {
    initFirebase();
    stopPolling(gameId);

    var checkAndSubscribe = function () {
      if (!_db) {
        setTimeout(checkAndSubscribe, 500);
        return;
      }

      try {
        // ── SUBSCRIBE: same path as PresenceService.subscribeToGameViewers ──
        var viewerCountRef = _db.ref(
          "presence/games/" + gameId + "/viewerCount",
        );
        _gameRefs[gameId] = viewerCountRef;

        viewerCountRef.on(
          "value",
          function (snapshot) {
            var count = snapshot.exists() ? snapshot.val() : 0;
            _notify(gameId, count);
          },
          function (err) {
            console.warn(
              "LiveTracker: Firebase read error for " + gameId,
              err.message,
            );
          },
        );

        // ── RECORD VIEW: only when explicitly requested (scoreboard page) ──
        if (recordView) {
          var userId = getUserId();
          var userPresenceRef = _db.ref(
            "presence/games/" + gameId + "/viewers/" + userId,
          );

          userPresenceRef
            .once("value")
            .then(function (snap) {
              if (!snap.exists()) {
                userPresenceRef.set(true);
                _db
                  .ref("presence/games/" + gameId + "/viewerCount")
                  .transaction(function (current) {
                    return (current || 0) + 1;
                  });
              }
            })
            .catch(function () {});
        }
      } catch (e) {
        console.warn("LiveTracker: Subscribe error", e.message);
      }
    };

    checkAndSubscribe();
  }

  function stopPolling(gameId) {
    if (_gameRefs[gameId]) {
      try {
        _gameRefs[gameId].off("value");
      } catch (e) {}
      delete _gameRefs[gameId];
    }
  }

  function getCount(gameId) {
    return _counts[gameId] || 0;
  }

  function stopAll() {
    Object.keys(_gameRefs).forEach(function (id) {
      stopPolling(id);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFirebase);
  } else {
    initFirebase();
  }

  return {
    onChange: onChange,
    startPolling: startPolling,
    startPollingAndRecord: startPollingAndRecord,
    stopPolling: stopPolling,
    getCount: getCount,
    stopAll: stopAll,
    formatCount: formatCount,
  };
})();

// ============================================
// Live Tracker Badge Component
// Mirrors the app's LiveViewerBadge EXACTLY
// ============================================
function createLiveTrackerBadge(sport, gameId, game) {
  var badge = document.createElement("span");
  badge.className = "live-tracker-badge";
  badge.id = "live-tracker-" + gameId;

  // ── Determine flags exactly like the app ──
  var statusStr = "";
  if (game && typeof game.status === "string") {
    statusStr = game.status;
  } else if (game && game.status && typeof game.status === "object") {
    statusStr = String(game.status.status || game.status.state || "");
  }

  var isCompletedFlag =
    (game && game.isCompleted) ||
    /final|post|completed|over|off|finished/i.test(statusStr);

  var isScheduledFlag =
    (game && !game.isLive && !game.isCompleted) ||
    /scheduled|pre|upcoming|not started|fut/i.test(statusStr);

  // Scheduled games — never show, never poll (matches app's `!isScheduledFlag ? ... : null`)
  if (isScheduledFlag) {
    badge.style.display = "none";
    return badge;
  }

  // Color: accent for live, muted for finished
  var badgeColor = isCompletedFlag
    ? "var(--text-secondary)"
    : "var(--accent-primary)";
  badge.style.borderColor = badgeColor;
  badge.style.color = badgeColor;

  badge.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
    '<span class="live-tracker-count" style="color:' +
    badgeColor +
    '">0</span>';

  // Show immediately for live games, hide for finished until count > 0
badge.style.display = "none";

  var unsub = LiveTrackerViewer.onChange(function (data) {
    if (data.gameId === gameId) {
      var count = data.count;
      var countEl = badge.querySelector(".live-tracker-count");
      if (countEl) countEl.textContent = LiveTrackerViewer.formatCount(count);

      if (count === 0) {
        badge.style.display = "none";
      } else {
        badge.style.display = "";
      }
    }
  });

  // Expose a teardown so hosts can drop the listener before discarding the
  // badge (e.g. when the grid is re-rendered on every poll). Without this,
  // every poll leaks a listener and a Firebase ref, which causes the UI to
  // flicker and stall over time.
  badge.destroy = function () {
    try {
      if (typeof unsub === "function") unsub();
    } catch (e) {}
    try {
      LiveTrackerViewer.stopPolling(gameId);
    } catch (e) {}
  };

  // Read-only: subscribe to count, don't record view (matches app's useGamePresenceReadOnly)
  LiveTrackerViewer.startPolling(sport, gameId);
  return badge;
}
