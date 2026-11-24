/* ─── Spotify embed playback controller ─────────────────────────────────────
 * Mounts Spotify embeds through the official iFrame API so playback can be
 * controlled from JS. The reason we need this is "clip mode": Spotify's raw
 * <iframe> embed always plays whatever the listener is entitled to (a full song
 * on Premium), and there is no URL flag to shorten it. The iFrame API does let
 * us watch the position and pause, so we can stop a track after N seconds.
 *
 *   STPlayer.mount(container, { type, id, height, clipSeconds })
 *   STPlayer.clear()   → destroy everything mounted so far
 *
 * Only one script tag is ever injected, and it is injected lazily (on the first
 * mount). If it fails to load, mount() falls back to a plain iframe: playback
 * still works, it just can't be auto-stopped.
 * ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  "use strict";

  var API_SRC = "https://open.spotify.com/embed/iframe-api/v1";
  /* The API script is fairly large; give it room before giving up and falling
   * back to a plain iframe. */
  var LOAD_TIMEOUT_MS = 14000;

  var apiPromise = null;
  var mounted = [];
  var seq = 0;

  /* Set once the API is available — kept on the exports object so it can be
   * inspected from the console when something misbehaves. */
  var readyApi = null;

  /* Lightweight counters, readable via STPlayer.stats. */
  var stats = { mounts: 0, controllers: 0, fallbacks: 0, apiUnavailable: 0 };

  function loadApi() {
    if (apiPromise) return apiPromise;

    apiPromise = new Promise(function (resolve) {
      var settled = false;
      var finish = function (api) {
        if (settled) return;
        settled = true;
        resolve(api);
      };

      global.onSpotifyIframeApiReady = function (IFrameAPI) {
        readyApi = IFrameAPI;
        finish(IFrameAPI);
      };

      var script = document.createElement("script");
      script.src = API_SRC;
      script.async = true;
      script.onerror = function () {
        finish(null);
      };
      document.head.appendChild(script);

      /* If the script silently never calls us back, don't hang the page. */
      setTimeout(function () {
        finish(null);
      }, LOAD_TIMEOUT_MS);
    });

    return apiPromise;
  }

  function rawIframe(container, opts) {
    var iframe = document.createElement("iframe");
    iframe.src =
      "https://open.spotify.com/embed/" +
      opts.type +
      "/" +
      opts.id +
      "?utm_source=generator&theme=0";
    iframe.width = "100%";
    iframe.height = String(opts.height);
    iframe.style.width = "100%";
    iframe.style.height = opts.height + "px";
    iframe.style.border = "0";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute(
      "allow",
      "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture",
    );
    iframe.loading = "lazy";
    iframe.title = (opts.title || "Song") + " — Spotify player";
    container.appendChild(iframe);
    return iframe;
  }

  /* Auto-stop after `seconds`. To behave like a true clip — press play, hear the
   * same passage every time — we pause AND rewind to the start. Pausing alone
   * would leave the track mid-way, so the next press of play would resume from
   * there and trip the limit again immediately.
   *
   * IMPORTANT: `position` from the embed is in MILLISECONDS (Spotify's own docs
   * convert it with `position / 1000`). Comparing it directly against a value in
   * seconds made every clip stop after a few milliseconds.
   *
   * Two guards, because neither alone is enough:
   *   1. the playback position reported by the embed (exact, but only arrives
   *      as often as the embed chooses to report it);
   *   2. a wall-clock timer started when playback is first seen running, which
   *      still fires if position updates are sparse or missing. */
  function attachClip(controller, seconds) {
    var limitMs = seconds * 1000;
    var watchdog = null;
    var stopped = false;

    function clearWatchdog() {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    }

    function armWatchdog() {
      if (watchdog) return;
      watchdog = setTimeout(function () {
        watchdog = null;
        stop();
      }, seconds * 1000 + 750);
    }

    function stop() {
      stopped = true;
      clearWatchdog();
      try {
        controller.pause();
      } catch (err) {
        /* ignore */
      }
      try {
        controller.seek(0);
      } catch (err) {
        /* ignore */
      }
      /* Allow the clip to be replayed: the next play starts a fresh window. */
      setTimeout(function () {
        stopped = false;
      }, 600);
    }

    controller.addListener("playback_update", function (e) {
      var d = e && e.data;
      if (!d) return;

      if (d.isPaused) {
        /* User (or our own stop) took it out of play — disarm. */
        clearWatchdog();
        return;
      }
      if (d.isBuffering || stopped) return;

      if (typeof d.position === "number" && d.position >= limitMs) {
        stop();
        return;
      }
      armWatchdog();
    });
  }

  /* Pause every controller except `except`. This is what stops two songs playing
   * at once.
   *
   * Why it is needed even though Spotify usually does this itself: when the
   * LISTENER IS NOT signed in, each embed is an independent anonymous player and
   * Spotify has no reason to link them — so pressing play on one leaves the other
   * running (audibly, if quietly, and confusing during a tournament). Switching
   * to another matchup happens to work because we destroy the old controllers;
   * this catches the rest. Signed-in listeners get it for free from Spotify,
   * which is why it looked like it already worked. */
  function pauseOthers(except) {
    mounted.forEach(function (other) {
      if (other === except) return;
      try {
        other.pause();
      } catch (err) {
        /* ignore */
      }
    });
  }

  /* Make one controller exclusive: as soon as it reports playing, pause the
   * others. Uses playback_update, so it works regardless of how playback was
   * started (our UI, the embed's own button, or a keyboard shortcut). */
  function attachExclusive(controller) {
    var settled = false;
    controller.addListener("playback_update", function (e) {
      var d = e && e.data;
      if (!d || d.isPaused) {
        if (d && d.isPaused) settled = false;
        return;
      }
      if (d.isBuffering) return;
      /* Only act on the transition into playing, so we don't re-pause others on
       * every position tick. */
      if (settled) return;
      settled = true;
      pauseOthers(controller);
    });
  }

  function mount(container, opts) {
    if (!container) return Promise.resolve(null);
    container.innerHTML = "";

    return loadApi().then(function (api) {
      if (!api) {
        stats.apiUnavailable++;
        return rawIframe(container, opts);
      }
      stats.mounts++;

      return new Promise(function (resolve) {
        var host = document.createElement("div");
        host.className = "embed-host";
        host.id = "st-embed-" + ++seq;
        container.appendChild(host);

        var uri = "spotify:" + opts.type + ":" + opts.id;
        var settled = false;

        /* createController is documented to call back, but if it ever doesn't
         * we would be left with an invisible player. Fall back instead. */
        var fallback = setTimeout(function () {
          if (settled) return;
          settled = true;
          stats.fallbacks++;
          container.innerHTML = "";
          rawIframe(container, opts);
          resolve(null);
        }, 5000);

        try {
          api.createController(
            host,
            {
              uri: uri,
              width: "100%",
              height: String(opts.height),
            },
            function (controller) {
              if (settled) return;
              settled = true;
              clearTimeout(fallback);
              stats.controllers++;
              mounted.push(controller);
              /* Every player is exclusive — only one song sounds at a time. */
              attachExclusive(controller);
              if (opts.clipSeconds > 0) attachClip(controller, opts.clipSeconds);
              resolve(controller);
            },
          );
        } catch (err) {
          /* Anything unexpected: still show a working embed. */
          if (!settled) {
            settled = true;
            clearTimeout(fallback);
            stats.fallbacks++;
            container.innerHTML = "";
            rawIframe(container, opts);
            resolve(null);
          }
        }
      });
    });
  }

  /* Tear down every controller. Must be called before re-rendering a matchup,
   * or old embeds keep playing and leak. */
  function clear() {
    mounted.forEach(function (controller) {
      try {
        controller.destroy();
      } catch (err) {
        /* ignore */
      }
    });
    mounted = [];
  }

  global.STPlayer = {
    mount: mount,
    clear: clear,
    stats: stats,
    /* Currently live controllers. Useful for poking at playback from the
     * console, e.g. STPlayer.controllers()[0].seek(0). */
    controllers: function () {
      return mounted.slice();
    },
    /* The raw IFrame API object, once loaded. Handy for debugging in console. */
    getApi: function () {
      return readyApi;
    },
  };
})(window);
