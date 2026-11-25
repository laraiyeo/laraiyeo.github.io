/* ─── Apple Music preview player ─────────────────────────────────────────────
 * Renders a preview card and controls a native <audio> element. Apple supplies
 * one 30-second preview per track, so "clip mode" simply stops and rewinds after
 * PLAY_SECONDS.
 *
 *   STPlayer.mount(container, { previewUrl, image, title, artistName, height, clipSeconds })
 *   STPlayer.clear()   → destroy everything mounted so far
 *
 * Previews are fetched once and kept as blob URLs, so scrubbing or replaying a
 * track never re-downloads from the CDN.
 * ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  "use strict";

  var mounted = [];

  var stats = { mounts: 0, controllers: 0 };
  /* A preview is ~1 MB, so a long tournament would otherwise pin tens of
   * megabytes of blob URLs for the life of the page. Keep a small LRU. */
  var PREVIEW_LRU_MAX = 12;
  var previewPromises = {};
  var previewObjectUrls = {};
  var previewLru = [];

  function forgetPreview(url) {
    var objectUrl = previewObjectUrls[url];
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        /* ignore */
      }
      delete previewObjectUrls[url];
    }
    delete previewPromises[url];
  }

  function touchPreview(url) {
    var at = previewLru.indexOf(url);
    if (at !== -1) previewLru.splice(at, 1);
    previewLru.push(url);
    while (previewLru.length > PREVIEW_LRU_MAX) {
      forgetPreview(previewLru.shift());
    }
  }

  function preparePreview(url) {
    if (!url) return Promise.resolve("");
    if (previewPromises[url]) {
      touchPreview(url);
      return previewPromises[url];
    }

    previewPromises[url] = new Promise(function (resolve) {
      if (!global.caches) {
        resolve(url);
        return;
      }

      global.caches.open("st-apple-previews-v1").then(function (cache) {
        return cache.match(url).then(function (cached) {
          if (cached) return cached;
          return fetch(url).then(function (res) {
            if (!res.ok) throw new Error("Preview fetch failed.");
            cache.put(url, res.clone());
            return res;
          });
        });
      }).then(function (response) {
        return response.blob();
      }).then(function (blob) {
        /* The LRU may have evicted this URL while the download was in flight;
         * in that case hand back the direct URL rather than a leaked blob. */
        if (!previewPromises[url]) {
          resolve(url);
          return;
        }
        if (!previewObjectUrls[url]) {
          /* Apple serves these as `audio/x-m4p`, which some engines refuse to
           * decode from a blob URL. Re-labelling the same bytes as audio/mp4
           * is a no-op for correct decoders and unsticks the picky ones. */
          if (blob.type !== "audio/mp4" && blob.type !== "audio/mpeg") {
            blob = blob.slice(0, blob.size, "audio/mp4");
          }
          var objectUrl = URL.createObjectURL(blob);
          previewObjectUrls[url] = objectUrl;
          touchPreview(url);
        }
        resolve(previewObjectUrls[url]);
      }).catch(function () {
        resolve(url);
      });
    });

    return previewPromises[url];
  }


  /* Relative luminance (WCAG) of a #RRGGBB colour, so text can be switched
   * between black and white based on how light the artwork's background is. */
  function luminance(hex) {
    var value = String(hex || "").replace("#", "");
    if (value.length === 3) {
      value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    }
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
    var channels = [0, 2, 4].map(function (i) {
      var c = parseInt(value.substr(i, 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function readableTextColor(bgColor) {
    var l = luminance(bgColor);
    /* No usable colour (or a very pale one) falls back to white text, which is
     * what every dark default background needs. */
    if (l === null) return "#ffffff";
    return l > 0.45 ? "#121212" : "#ffffff";
  }

  function formatDuration(ms) {
    var total = Math.max(0, Math.round((ms || 0) / 1000));
    return Math.floor(total / 60) + ":" + ("0" + (total % 60)).slice(-2);
  }

  function formatReleaseDate(iso) {
    if (!iso) return "";
    var parts = String(iso).slice(0, 10).split("-");
    if (parts.length < 3) return "";
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /* A small rounded label, matching the explicit/release/genre chips. */
  function chip(text, className) {
    var el = document.createElement("span");
    el.className = "apple-chip" + (className ? " " + className : "");
    el.textContent = text;
    return el;
  }

  function mount(container, opts) {
    if (!container) return Promise.resolve(null);
    container.innerHTML = "";

    if (opts.previewUrl) {
      var bg = opts.bgColor ? "#" + String(opts.bgColor).replace("#", "") : "";
      var fg = readableTextColor(opts.bgColor);

      var card = document.createElement("div");
      card.className = "apple-preview-card";
      if (opts.height >= 200) card.classList.add("apple-preview-card-large");
      if (bg) card.style.setProperty("--pv-bg", bg);
      card.style.setProperty("--pv-fg", fg);

      var art = document.createElement("img");
      art.className = "apple-preview-art";
      art.alt = opts.title ? opts.title + " album artwork" : "Album artwork";
      /* An empty `src` resolves to the page URL and fires a bogus request for
       * the document itself, so only assign a real URL. */
      if (opts.image) {
        art.src = opts.image;
        art.onerror = function () {
          art.style.display = "none";
          card.classList.add("apple-preview-no-art");
        };
      } else {
        art.style.display = "none";
        card.classList.add("apple-preview-no-art");
      }

      /* Logo in the top-right corner, mirroring the reference layout. */
      var brand = document.createElement("img");
      brand.className = "apple-preview-brand";
      brand.src = "/assets/33115791.png";
      brand.alt = "";
      brand.setAttribute("aria-hidden", "true");
      brand.onerror = function () {
        brand.style.display = "none";
      };

      var copy = document.createElement("div");
      copy.className = "apple-preview-copy";

      var title = document.createElement("strong");
      title.className = "apple-preview-title";
      title.textContent = opts.title || "Song";

      var credit = document.createElement("div");
      credit.className = "apple-preview-credit";

      /* The explicit marker belongs beside the artist name, as in the reference
       * player, so it is appended to the credit line rather than the chip row. */
      if (opts.isExplicit) {
        var tag = chip("E", "apple-chip-explicit");
        tag.title = "Explicit";
        tag.setAttribute("aria-label", "Explicit");
        credit.appendChild(tag);
      }

      var artist = document.createElement("span");
      artist.className = "apple-preview-artist";
      artist.textContent = opts.artistName || "";
      credit.appendChild(artist);

      /* Release date and genres sit with the album metadata on the card, so the
       * player itself only carries what identifies the track. */
      var released = formatReleaseDate(opts.releaseDate);
      var labels = [];
      if (released) labels.push(released);
      (opts.genres || []).slice(0, 2).forEach(function (genre) {
        labels.push(genre);
      });

      copy.appendChild(title);
      copy.appendChild(credit);

      /* Release/featured/album chips are rendered on the card by app.js; only
       * render them here as a fallback when the caller supplies no card tags. */
      if (!opts.chipsOnCard && labels.length) {
        var meta = document.createElement("div");
        meta.className = "apple-preview-chips";
        labels.forEach(function (label) {
          meta.appendChild(chip(label));
        });
        copy.appendChild(meta);
      }

      var play = document.createElement("button");
      play.type = "button";
      play.className = "apple-preview-play";
      play.setAttribute("aria-label", "Play preview");
      play.textContent = "▶";

      var audio = document.createElement("audio");
      audio.preload = "none";
      audio.title = (opts.title || "Song") + " preview";
      audio.style.display = "none";

      var progress = document.createElement("input");
      progress.type = "range";
      progress.className = "apple-preview-progress";
      progress.min = "0";
      progress.max = String(opts.clipSeconds || 30);
      progress.value = "0";
      progress.step = "0.1";
      progress.setAttribute("aria-label", "Preview position");

      var time = document.createElement("span");
      time.className = "apple-preview-time";
      /* Counts down to the end of the preview, like the reference player. */
      time.textContent = formatDuration((opts.clipSeconds || 30) * 1000);

      var bar = document.createElement("div");
      bar.className = "apple-preview-bar";
      bar.appendChild(progress);
      bar.appendChild(time);

      card.appendChild(art);
      card.appendChild(brand);
      card.appendChild(copy);
      card.appendChild(bar);
      card.appendChild(play);
      card.appendChild(audio);
      container.appendChild(card);

      var controller = {
        audio: audio,
        pause: function () { audio.pause(); },
        destroy: function () {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
      };
      mounted.push(controller);

      function formatTime(seconds) {
        var whole = Math.max(0, Math.floor(seconds || 0));
        return Math.floor(whole / 60) + ":" + ("0" + (whole % 60)).slice(-2);
      }

      /* If a cached blob turns out to be undecodable, retry once from the
       * original URL instead of leaving the card permanently silent. */
      var fellBackToDirect = false;
      audio.addEventListener("error", function () {
        if (fellBackToDirect) return;
        if (audio.src.indexOf("blob:") !== 0) return;
        fellBackToDirect = true;
        audio.src = opts.previewUrl;
        audio.load();
        audio.play().catch(function () {});
      });

      play.addEventListener("click", function () {
        if (audio.paused) {
          document.querySelectorAll("audio").forEach(function (other) {
            if (other !== audio) other.pause();
          });
          preparePreview(opts.previewUrl).then(function (source) {
            if (audio.src !== source) {
              audio.src = source;
              audio.load();
            }
            audio.play().catch(function () {});
          });
        } else {
          audio.pause();
        }
      });
      audio.addEventListener("play", function () {
        play.textContent = "Ⅱ";
        card.classList.add("is-playing");
        document.querySelectorAll("audio").forEach(function (other) {
          if (other !== audio) other.pause();
        });
      });
      audio.addEventListener("pause", function () {
        play.textContent = "▶";
        card.classList.remove("is-playing");
      });
      audio.addEventListener("timeupdate", function () {
        var limit = opts.clipSeconds || 30;
        var at = Math.min(audio.currentTime, limit);
        progress.value = String(at);
        /* Remaining time, so it reads like a countdown. */
        time.textContent = "-" + formatTime(limit - at);
      });
      progress.addEventListener("input", function () {
        audio.currentTime = Number(progress.value);
      });
      if (opts.clipSeconds > 0) {
        var stopped = false;
        audio.addEventListener("timeupdate", function () {
          if (!stopped && audio.currentTime >= opts.clipSeconds) {
            stopped = true;
            audio.pause();
            audio.currentTime = 0;
            setTimeout(function () { stopped = false; }, 600);
          }
        });
      }
      stats.mounts++;
      return Promise.resolve(controller);
    }
  }

  /* Tear down every player. Must be called before re-rendering a matchup, or old
   * audio keeps playing. */
  function clear() {
    mounted.forEach(function (player) {
      try {
        player.destroy();
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
    /* Shared with app.js so card chips and the player agree on the format. */
    formatReleaseDate: formatReleaseDate,
    /* Currently live players, useful for poking at playback from the console. */
    controllers: function () {
      return mounted.slice();
    },
  };
})(window);