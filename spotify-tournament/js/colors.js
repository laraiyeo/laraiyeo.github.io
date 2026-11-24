/* ─── Album-art colour extraction ───────────────────────────────────────────
 * Reads the dominant colour(s) out of a song's cover art so the matchup card can
 * carry a light gradient built from the album's own palette.
 *
 * Spotify's image CDN (i.scdn.co) sends CORS headers, so the art can be drawn to
 * a canvas and read back. If that ever stops being true, extraction simply fails
 * and the card stays untinted — nothing breaks.
 *
 *   STColors.apply(cardEl, song)   → adds a gradient once the art is sampled
 *
 * Results are cached per image URL, since many songs share album art.
 * ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  "use strict";

  var cache = Object.create(null); // imageUrl -> { c1: "r,g,b", c2: "r,g,b" } | null
  var canvas = null;
  var ctx = null;

  function getCtx() {
    if (!ctx) {
      canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 40;
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    }
    return ctx;
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var h = 0;
    var s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: h, s: s, l: l };
  }

  /* Nudge a colour to be a bit richer, so it still reads on a near-black card. */
  function liven(r, g, b) {
    var hsl = rgbToHsl(r, g, b);
    hsl.s = Math.min(1, hsl.s * 1.25 + 0.08);
    hsl.l = Math.min(0.72, Math.max(0.42, hsl.l));
    return hslToRgb(hsl.h, hsl.s, hsl.l);
  }

  function hslToRgb(h, s, l) {
    if (s === 0) {
      var v = Math.round(l * 255);
      return [v, v, v];
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    var hue = function (t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [
      Math.round(hue(h + 1 / 3) * 255),
      Math.round(hue(h) * 255),
      Math.round(hue(h - 1 / 3) * 255),
    ];
  }

  /* Pull the two most prominent *colourful* hues, falling back to the overall
   * average when the art is basically greyscale. */
  function analyse(data) {
    var bins = {}; // hue bucket -> { weight, r, g, b }
    var ar = 0;
    var ag = 0;
    var ab = 0;
    var an = 0;

    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      ar += r;
      ag += g;
      ab += b;
      an++;

      var hsl = rgbToHsl(r, g, b);
      /* Ignore near-black, near-white and washed-out pixels — they carry no
       * useful colour information. */
      if (hsl.s < 0.18 || hsl.l < 0.1 || hsl.l > 0.94) continue;
      var bucket = Math.floor(hsl.h * 12) % 12;
      var w = hsl.s; // weight by saturation
      var bin = (bins[bucket] = bins[bucket] || { weight: 0, r: 0, g: 0, b: 0 });
      bin.weight += w;
      bin.r += r * w;
      bin.g += g * w;
      bin.b += b * w;
    }

    if (an === 0) return null;

    var keys = Object.keys(bins).sort(function (a, b) {
      return bins[b].weight - bins[a].weight;
    });

    /* Greyscale art: nothing cleared the saturation bar. Use the mean colour. */
    if (!keys.length) {
      var avg = liven(Math.round(ar / an), Math.round(ag / an), Math.round(ab / an));
      return {
        c1: avg.join(","),
        c2: avg.map(function (v) {
          return Math.round(v * 0.62);
        }).join(","),
      };
    }

    var primary = bins[keys[0]];
    var c1 = liven(
      Math.round(primary.r / primary.weight),
      Math.round(primary.g / primary.weight),
      Math.round(primary.b / primary.weight),
    );

    /* A second hue at least 60° away, so the gradient has some travel in it. */
    var secondary = null;
    var pBucket = Number(keys[0]);
    for (var k = 1; k < keys.length; k++) {
      var bkt = Number(keys[k]);
      var dist = Math.min(Math.abs(bkt - pBucket), 12 - Math.abs(bkt - pBucket));
      if (dist >= 2) {
        secondary = bins[keys[k]];
        break;
      }
    }

    var c2;
    if (secondary) {
      c2 = liven(
        Math.round(secondary.r / secondary.weight),
        Math.round(secondary.g / secondary.weight),
        Math.round(secondary.b / secondary.weight),
      );
    } else {
      /* Single dominant colour — use a darker tone of it for depth. */
      c2 = c1.map(function (v) {
        return Math.round(v * 0.55);
      });
    }

    return { c1: c1.join(","), c2: c2.join(",") };
  }

  function extract(url) {
    if (!url) return Promise.resolve(null);
    if (url in cache) return Promise.resolve(cache[url]);

    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      var done = false;
      var finish = function (result) {
        if (done) return;
        done = true;
        cache[url] = result;
        resolve(result);
      };

      img.onload = function () {
        try {
          var c = getCtx();
          c.clearRect(0, 0, 40, 40);
          c.drawImage(img, 0, 0, 40, 40);
          finish(analyse(c.getImageData(0, 0, 40, 40).data));
        } catch (e) {
          /* Canvas tainted or decode issue — no tint, no error. */
          finish(null);
        }
      };
      img.onerror = function () {
        finish(null);
      };
      /* Never let a stalled image hang the card forever. */
      setTimeout(function () {
        finish(null);
      }, 4000);
      img.src = url;
    });
  }

  /* Tint a card from its song's art. Safe to call for every card; failures are
   * silent and the card simply keeps its flat background. */
  function apply(cardEl, song) {
    var url = song && song.image;
    if (!url) return;
    extract(url).then(function (colors) {
      if (!colors) return;
      cardEl.style.setProperty("--c1", colors.c1);
      cardEl.style.setProperty("--c2", colors.c2);
      cardEl.classList.add("tinted");
    });
  }

  global.STColors = { extract: extract, apply: apply };
})(window);
