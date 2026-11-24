/* ─── Song Tournament — app controller ──────────────────────────────────────
 * Wires the setup screen (search + options) to the data layer and drives the
 * three screens: setup → tournament → champion.
 *
 * Two formats share one prompt/answer pipeline:
 *   "bracket" — pure single elimination               (window.STBracket)
 *   "league"  — Champions League style group stage    (window.STLeague)
 *               followed by QF → SF → Final
 * ────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var CFG = window.STConfig;
  var $ = function (id) {
    return document.getElementById(id);
  };

  /* A build needs the artist rules, the track-picking mode and whether featured
   * songs are allowed — but never the market. Spotify resolves the market from
   * the access token, so passing one is redundant and easy to get wrong. */
  function buildOptions() {
    return {
      mode: getMode(),
      includeFeatured: els.includeFeatured.checked,
      shuffleSeeds: els.shuffleSeeds.checked,
      perArtist: songsPerArtist(),
      format: getFormat(),
      groups: groupChoice(),
    };
  }

  var els = {
    connDot: $("connDot"),
    connStatus: $("connStatus"),
    logoutBtn: $("logoutBtn"),
    clientIdInput: $("clientIdInput"),
    saveClientIdBtn: $("saveClientIdBtn"),
    connectBtn: $("connectBtn"),
    redirectUriText: $("redirectUriText"),
    copyRedirectBtn: $("copyRedirectBtn"),
    connHint: $("connHint"),
    connectPanel: $("connectPanel"),
    publicPanel: $("publicPanel"),
    publicHint: $("publicHint"),
    leagueNotice: $("leagueNotice"),
    leagueNoticeText: $("leagueNoticeText"),
    leagueNoticeCount: $("leagueNoticeCount"),
    leagueFormatNote: $("leagueFormatNote"),
    songModeSubhead: $("songModeSubhead"),
    topModeTitle: $("topModeTitle"),
    randomModeTitle: $("randomModeTitle"),
    includeFeatured: $("includeFeatured"),
    shuffleSeeds: $("shuffleSeeds"),
    playLength: $("playLength"),
    groupsRow: $("groupsRow"),
    groupCount: $("groupCount"),
    groupsNote: $("groupsNote"),
    albumPanel: $("albumPanel"),
    albumPanelBody: $("albumPanelBody"),
    loadAlbumsBtn: $("loadAlbumsBtn"),
    clearAlbumsBtn: $("clearAlbumsBtn"),
    albumStatus: $("albumStatus"),
    artistReqPrefix: $("artistReqPrefix"),
    maxArtistsText: $("maxArtistsText"),
    artistReqSuffix: $("artistReqSuffix"),
    artistHint: $("artistHint"),
    artistSearchInput: $("artistSearchInput"),
    searchSpinner: $("searchSpinner"),
    searchResults: $("searchResults"),
    genreSearchInput: $("genreSearchInput"),
    genreSearchBtn: $("genreSearchBtn"),
    artistCount: $("artistCount"),
    selectedArtists: $("selectedArtists"),
    buildBtn: $("buildBtn"),
    buildStatus: $("buildStatus"),
    setupScreen: $("setupScreen"),
    tournamentScreen: $("tournamentScreen"),
    championScreen: $("championScreen"),
    roundLabel: $("roundLabel"),
    progressText: $("progressText"),
    progressBarInner: $("progressBarInner"),
    stageProgress: $("stageProgress"),
    stageLabel: $("stageLabel"),
    stageBarInner: $("stageBarInner"),
    stageText: $("stageText"),
    undoBtn: $("undoBtn"),
    resetBtn: $("resetBtn"),
    matchup: $("matchup"),
    standingsWrap: $("standingsWrap"),
    summaryLabel: $("summaryLabel"),
    bracket: $("bracket"),
    bracketDetails: $("bracketDetails"),
    championTitle: $("championTitle"),
    championArtist: $("championArtist"),
    championEmbed: $("championEmbed"),
    podiumStage: $("podiumStage"),
    podiumList: $("podiumList"),
    championUndoBtn: $("championUndoBtn"),
    playAgainBtn: $("playAgainBtn"),
    newTournamentBtn: $("newTournamentBtn"),
  };

  var state = {
    me: null,
    selected: [], // [{id, name, image, genres, songs}]
    allSongs: [],
    options: { shuffleSeeds: true },
    tournament: null, // STBracket.Tournament when format = "bracket"
    league: null, // STLeague.League when format = "league"
    /* null = unknown, true = last Spotify call failed, false = verified OK */
    connError: null,
    /* HTTP status of the last failure, so a 403 (not on the allowlist) can be
     * reported differently from a genuine network problem. */
    connErrorStatus: null,
    /* Album picker (random mode). `albums` is keyed by artist id so a re-render
     * keeps every artist's loaded list; `picked` holds chosen album ids and
     * `pickedBy` records which artist each album belongs to, so a stale pick can
     * be dropped when its artist is removed. */
    albums: {},
    picked: {},
    pickedBy: {},
  };

  /* How many groups the league format will use. The group control is clamped by
   * the artist count, and we ask the league module so both agree. */
  function groupChoice() {
    var n = parseInt(els.groupCount && els.groupCount.value, 10) || 2;
    return n;
  }

  function groupCap() {
    var n = state.selected.length;
    /* 0 means "this artist count can't be grouped at all" (odd/prime). */
    if (!n || !window.STLeague || !window.STLeague.maxGroups) return 0;
    return window.STLeague.maxGroups(n);
  }

  /* The group count that will actually be used. 0 means the current artist count
   * cannot form even groups — callers must treat that as "not buildable". */
  function effectiveGroups() {
    var n = state.selected.length;
    if (!n) return groupChoice();
    if (window.STLeague && window.STLeague.resolveGroupCount) {
      return window.STLeague.resolveGroupCount(groupChoice(), n);
    }
    return groupChoice();
  }

  /* The group count for display purposes, falling back to the raw choice so
   * wording still reads sensibly while the field is invalid. */
  function effectiveGroupSplit() {
    return effectiveGroups() || groupChoice();
  }

  function pickedAlbumIds() {
    return Object.keys(state.picked);
  }

  var searchTimer = null;

  /* ── Access mode ────────────────────────────────────────────────────────── */
  /* Public mode (an API proxy is configured) needs no Spotify login at all:
   * data comes from an app-only token held server-side. Direct mode is the
   * original PKCE flow, where each visitor authorises their own account. */
  function isPublic() {
    return !!(window.STSpotify && window.STSpotify.isPublic && window.STSpotify.isPublic());
  }

  /* Which songs are available is the real gate on building — not whether a
   * token exists. Public mode has no user, so it asks a different question. */
  function canUseCatalogue() {
    return isPublic() ? !state.connError : window.STAuth.isLoggedIn();
  }

  /* ── Format helpers ─────────────────────────────────────────────────────── */
  function getFormat() {
    var checked = document.querySelector('input[name="format"]:checked');
    return checked ? checked.value : "bracket";
  }

  function isLeague() {
    return getFormat() === "league";
  }

  function maxArtists() {
    /* Group + Knockout allows many more artists than a bracket (which has to pad
     * to a power of two). */
    return isLeague() ? CFG.LEAGUE_MAX_ARTISTS || 64 : CFG.MAX_ARTISTS;
  }

  /* How many songs each artist contributes. Scaled by how many artists are in
   * play so a 16-artist field doesn't balloon to 160 songs: the total is held
   * near SONGS_TARGET_TOTAL and the per-artist share follows from that.
   * `perArtist` is what each artist will actually yield, whereas `songsPerGroup`
   * is what the league needs for a clean round-robin. */
  function songsPerArtist(artistCount) {
    var n = artistCount || state.selected.length || 6;
    var min = isLeague()
      ? CFG.LEAGUE.SONGS_PER_ARTIST
      : CFG.SONGS_MIN_PER_ARTIST || 2;
    if (window.STLeague && window.STLeague.songsPerArtist) {
      return window.STLeague.songsPerArtist(
        n,
        CFG.SONGS_TARGET_TOTAL || 48,
        min,
        CFG.SONGS_MAX_PER_ARTIST || 10,
      );
    }
    return Math.max(min, Math.min(CFG.SONGS_MAX_PER_ARTIST || 10, Math.round((CFG.SONGS_TARGET_TOTAL || 48) / n)));
  }

  /* ── Small DOM helpers ──────────────────────────────────────────────────── */
  function avatarEl(url, name) {
    if (url) {
      var img = document.createElement("img");
      img.src = url;
      img.alt = name || "";
      img.loading = "lazy";
      img.onerror = function () {
        this.replaceWith(fallbackAvatar(name));
      };
      return img;
    }
    return fallbackAvatar(name);
  }

  function fallbackAvatar(name) {
    var d = document.createElement("div");
    d.className = "avatar-fallback";
    d.textContent = (name || "?").trim().charAt(0).toUpperCase() || "?";
    return d;
  }

  function tag(text, primary) {
    var s = document.createElement("span");
    s.className = "tag" + (primary ? " tag-primary" : "");
    s.textContent = text;
    return s;
  }

  /* Clip length in seconds for the current selection; 0 means no limit.
   * "preview" plays a fixed excerpt, "full" lets Spotify decide. */
  function playSeconds() {
    var choice = els.playLength
      ? els.playLength.value
      : CFG.PLAY_LENGTH || "full";
    return choice === "preview" ? CFG.PLAY_SECONDS || 30 : 0;
  }

  /* Render a Spotify player for one song into `container`. Goes through the
   * player module so clip mode can auto-stop; falls back to a plain iframe if
   * the iFrame API doesn't load. */
  function renderPlayer(container, obj, height) {
    if (window.STPlayer) {
      window.STPlayer.mount(container, {
        type: obj.type,
        id: obj.id,
        height: height,
        clipSeconds: playSeconds(),
        title: obj.title,
      });
      return;
    }
    fillEmbed(container, obj, height > 200);
  }

  function fillEmbed(container, obj, tall) {
    container.innerHTML = "";
    var iframe = document.createElement("iframe");
    iframe.src =
      "https://open.spotify.com/embed/" +
      obj.type +
      "/" +
      obj.id +
      "?utm_source=generator&theme=" +
      (CFG.EMBED_THEME || "0");
    iframe.width = "100%";
    iframe.height = tall ? "232" : "152";
    iframe.style.height = (tall ? 232 : 152) + "px";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute(
      "allow",
      "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture",
    );
    iframe.loading = "lazy";
    iframe.title = (obj.title || "Song") + " — Spotify player";
    container.appendChild(iframe);
  }

  function showScreen(name) {
    els.setupScreen.hidden = name !== "setup";
    els.tournamentScreen.hidden = name !== "tournament";
    els.championScreen.hidden = name !== "champion";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setBuildStatus(msg) {
    els.buildStatus.textContent = msg || "";
  }

  function getMode() {
    var checked = document.querySelector('input[name="songMode"]:checked');
    return checked ? checked.value : "top";
  }

  /* ── Connection ─────────────────────────────────────────────────────────── */
  function refreshConnectionUI() {
    var publicMode = isPublic();
    var loggedIn = window.STAuth.isLoggedIn();
    var refused = state.connErrorStatus === 403;

    /* Swap the whole setup panel between the two modes. */
    els.connectPanel.hidden = publicMode;
    els.publicPanel.hidden = !publicMode;

    if (publicMode) {
      els.connDot.classList.toggle("on", !state.connError);
      els.connDot.classList.toggle("bad", !!state.connError);
      els.connStatus.textContent = state.connError
        ? refused
          ? "Catalogue service refused"
          : "Catalogue service unavailable"
        : "No login needed";
      els.artistSearchInput.disabled = !!state.connError;
      els.genreSearchInput.disabled = !!state.connError;
      els.genreSearchBtn.disabled = !!state.connError;
      els.logoutBtn.hidden = true;
      updateBuildState();
      return;
    }

    els.connDot.classList.toggle("on", loggedIn);
    els.connDot.classList.toggle("bad", state.connError);
    els.connStatus.textContent = state.connError
      ? refused
        ? "Not on the app's allowlist"
        : "Connection problem"
      : loggedIn
        ? state.me && state.me.display_name
          ? "Connected as " + state.me.display_name
          : "Connected"
        : "Not connected";
    els.logoutBtn.hidden = !loggedIn;
    setSearchEnabled(loggedIn);
    els.connectBtn.textContent = loggedIn
      ? "Reconnect to Spotify"
      : "Connect to Spotify";
    els.clientIdInput.value = window.STAuth.getClientId();
    updateBuildState();
  }

  /* Surface a failure in whichever panel is on screen. In public mode the
   * advice is about the deployed service, not about Spotify accounts — telling
   * someone to "add your account to the allowlist" would be actively wrong. */
  function explainConnectionError(err) {
    var publicMode = isPublic();
    var target = publicMode ? els.publicHint : els.connHint;

    if (publicMode) {
      var reason = (err && err.message) || "It didn't respond.";
      target.textContent =
        "Couldn't reach the song catalogue service. " +
        (reason.indexOf(".") === reason.length - 1 ? reason : reason + ".") +
        " Check that the proxy is deployed and that js/config.js points at " +
        "the right URL.";
      return false;
    }

    if (err && err.status === 403) {
      target.textContent =
        "You're signed in, but this Spotify account isn't allowed to use " +
        "this app. It's in development mode, which only permits accounts on " +
        "its allowlist. Add the account's Spotify email in the Developer " +
        "Dashboard: your app → Settings → Users Management → Add new user, " +
        "then reconnect. Note the app owner also needs Premium, and up to " +
        "5 accounts can be added.";
      return true;
    }
    target.textContent = (err && err.message) || "Could not reach Spotify.";
    return false;
  }

  function loadMe() {
    /* Public mode has no user, so there is nothing to load and nothing that
     * could fail. Going through /me there would always error. */
    if (isPublic()) {
      state.connError = null;
      state.connErrorStatus = null;
      refreshConnectionUI();
      return;
    }
    window.STSpotify.getMe()
      .then(function (me) {
        state.me = me;
        state.connError = false;
        state.connErrorStatus = null;
        els.connHint.textContent = "";
        refreshConnectionUI();
      })
      .catch(function (err) {
        /* Not fatal — Spotify still resolves the market from the token — but
         * it is the earliest signal that the connection is not really working. */
        state.connError = true;
        state.connErrorStatus = (err && err.status) || null;
        refreshConnectionUI();
        explainConnectionError(err);
      });
  }

  /* Confirm the catalogue service answers before the user starts typing. */
  function probeProxy() {
    if (!isPublic()) return;
    window.STSpotify.searchArtists("a", 1)
      .then(function () {
        var hadError = state.connError;
        state.connError = false;
        state.connErrorStatus = null;
        if (hadError) {
          els.publicHint.textContent = "";
          refreshConnectionUI();
        }
      })
      .catch(function (err) {
        state.connError = true;
        state.connErrorStatus = (err && err.status) || null;
        refreshConnectionUI();
        explainConnectionError(err);
      });
  }

  /* Both search inputs need the catalogue, so they enable together. */
  function setSearchEnabled(on) {
    els.artistSearchInput.disabled = !on;
    els.genreSearchInput.disabled = !on;
    els.genreSearchBtn.disabled = !on;
  }

  els.connectBtn.addEventListener("click", function () {
    var typed = els.clientIdInput.value.trim();
    if (typed) window.STAuth.setClientId(typed);
    els.connHint.textContent = "";
    window.STAuth.login().catch(function (err) {
      els.connHint.textContent = err.message;
    });
  });

  els.saveClientIdBtn.addEventListener("click", function () {
    window.STAuth.setClientId(els.clientIdInput.value.trim());
    els.connHint.textContent = "Client ID saved for this browser.";
  });

  els.logoutBtn.addEventListener("click", function () {
    window.STAuth.logout();
    state.me = null;
    refreshConnectionUI();
  });

  els.copyRedirectBtn.addEventListener("click", function () {
    var text = els.redirectUriText.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          els.copyRedirectBtn.textContent = "Copied";
          setTimeout(function () {
            els.copyRedirectBtn.textContent = "Copy";
          }, 1400);
        },
        function () {
          /* ignore */
        },
      );
    }
  });

  /* ── Artist search ──────────────────────────────────────────────────────── */
  els.artistSearchInput.addEventListener("input", function () {
    var val = els.artistSearchInput.value.trim();
    clearTimeout(searchTimer);
    if (val.length < 2) {
      hideResults();
      return;
    }
    els.searchSpinner.hidden = false;
    searchTimer = setTimeout(function () {
      runSearch(val);
    }, 320);
  });

  els.artistSearchInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideResults();
  });

  els.genreSearchBtn.addEventListener("click", runGenreSearch);

  els.genreSearchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      runGenreSearch();
    } else if (e.key === "Escape") {
      hideResults();
    }
  });

  document.addEventListener("click", function (e) {
    if (
      !els.searchResults.hidden &&
      !els.searchResults.contains(e.target) &&
      e.target !== els.artistSearchInput &&
      e.target !== els.genreSearchInput
    ) {
      hideResults();
    }
  });

  function runSearch(query) {
    window.STSpotify.searchArtists(query, 8)
      .then(function (res) {
        /* A success is proof the service works, so clear any previous failure
         * and repaint — otherwise a recovered service leaves the input
         * disabled and the status still reading "refused". */
        var hadError = state.connError;
        state.connError = false;
        state.connErrorStatus = null;
        if (hadError) {
          els.connHint.textContent = "";
          els.publicHint.textContent = "";
          refreshConnectionUI();
        }
        var items = (res.artists && res.artists.items) || [];
        renderSearchResults(items);
      })
      .catch(function (err) {
        state.connError = true;
        state.connErrorStatus = (err && err.status) || null;
        refreshConnectionUI();
        explainConnectionError(err);
        showResultsMessage((err && err.message) || "Search failed.");
      })
      .then(function () {
        els.searchSpinner.hidden = true;
      });
  }

  function hideResults() {
    els.searchResults.hidden = true;
    els.searchResults.innerHTML = "";
  }

  /* ── Similar artists ────────────────────────────────────────────────────── */
  /* Spotify has retired everything this feature originally leaned on:
   *   - GET /artists/{id}/related-artists  -> 403 Forbidden
   *   - GET /recommendations               -> removed entirely (404)
   *   - the artist `genres` field          -> deprecated, now always []
   * There is no longer any way to ask Spotify "who sounds like X". What is left
   * is relevance: searching for the artist's own name returns the artists Spotify
   * itself considers adjacent (Radiohead -> R.E.M., Muse, Thom Yorke), which is
   * what the chip uses.
   *
   * The one signal that still works is the `genre:` filter, but only for
   * Spotify's own simplified vocabulary — "indie rock" and "pop" match, whereas
   * the compound values it used to publish ("alternative rock", "art rock",
   * "prog rock") now return nothing. So the genre box asks the user for a genre
   * rather than pretending we can derive one. */

  var COVER_NOISE =
    /karaoke|tribute|cover band|cover version|sped up|slowed|8[- ]?bit|lullaby|made famous|in the style of|instrumental version|greatest hits|radio edit/i;

  /* Turn search results into a usable candidate list: drop the artist itself,
   * anyone already in the field, covers/karaoke, and duplicate names. */
  function similarCandidates(artist, items) {
    var have = {};
    var seenName = {};
    if (artist && artist.id) {
      have[artist.id] = true;
      seenName[String(artist.name || "").toLowerCase()] = true;
    }
    state.selected.forEach(function (a) {
      have[a.id] = true;
      seenName[String(a.name || "").toLowerCase()] = true;
    });

    return (items || []).filter(function (a) {
      if (!a || !a.id || have[a.id]) return false;
      var name = String(a.name || "");
      var key = name.toLowerCase();
      if (seenName[key]) return false;
      if (COVER_NOISE.test(name)) return false;
      seenName[key] = true;
      return true;
    });
  }

  /* How many candidates to surface. Spotify's relevance order is the only signal
   * left, and it degrades quickly: a search for "Radiohead" returns R.E.M.,
   * Muse, Bush and Thom Yorke first, then literal token matches like "Radio
   * Radio" and "RadioTradiX". Cutting at the head keeps the useful part and
   * drops the noise. */
  var SIMILAR_LIMIT = 4;

  function findSimilarArtists(artist) {
    els.searchSpinner.hidden = false;
    showResultsMessage("Finding artists related to " + artist.name + "…");

    window.STSpotify.searchArtists(artist.name, 10)
      .then(function (res) {
        var fresh = similarCandidates(
          artist,
          (res && res.artists && res.artists.items) || [],
        ).slice(0, SIMILAR_LIMIT);
        if (!fresh.length) {
          showResultsMessage(
            "No related artists found for " +
              artist.name +
              ". Try a genre search instead, or add artists by name.",
          );
          return;
        }
        renderSearchResults(fresh);
        /* Leave the name in the box so it is clear what produced these. */
        els.artistSearchInput.value = artist.name;
      })
      .catch(function (err) {
        showResultsMessage(
          "Couldn't look up similar artists. " + ((err && err.message) || ""),
        );
      })
      .then(function () {
        els.searchSpinner.hidden = true;
      });
  }

  /* Genre discovery — the only remaining route from "a vibe" to artists. */
  function runGenreSearch() {
    var genre = els.genreSearchInput.value.trim();
    if (genre.length < 2) return;

    els.searchSpinner.hidden = false;
    showResultsMessage("Finding artists tagged " + genre + "…");

    window.STSpotify.searchArtistsByGenre([genre], 10)
      .then(function (res) {
        var fresh = similarCandidates(
          null,
          (res && res.artists && res.artists.items) || [],
        );
        if (!fresh.length) {
          showResultsMessage(
            'Nothing found for "' +
              genre +
              '". Spotify only matches its own genre names — try "indie rock", "pop" or "hip hop".',
          );
          return;
        }
        renderSearchResults(fresh);
        els.artistSearchInput.value = genre;
      })
      .catch(function (err) {
        showResultsMessage("Genre search failed. " + ((err && err.message) || ""));
      })
      .then(function () {
        els.searchSpinner.hidden = true;
      });
  }

  function showResultsMessage(msg) {
    els.searchResults.innerHTML = "";
    var d = document.createElement("div");
    d.className = "search-empty";
    d.textContent = msg;
    els.searchResults.appendChild(d);
    els.searchResults.hidden = false;
  }

  function renderSearchResults(items) {
    if (!items.length) {
      showResultsMessage("No artists found. Try a different spelling.");
      return;
    }
    els.searchResults.innerHTML = "";
    items.forEach(function (artist) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-item";
      btn.appendChild(avatarEl(artist.images && artist.images[2] && artist.images[2].url, artist.name));

      var meta = document.createElement("div");
      meta.className = "meta";
      var strong = document.createElement("strong");
      strong.textContent = artist.name;
      meta.appendChild(strong);
      var sub = document.createElement("span");
      sub.textContent =
        (artist.genres && artist.genres.length
          ? artist.genres.slice(0, 2).join(", ")
          : "Artist") +
        (artist.followers && artist.followers.total
          ? " · " + artist.followers.total.toLocaleString() + " followers"
          : "");
      meta.appendChild(sub);
      btn.appendChild(meta);

      /* Offer to branch out from this artist rather than just adding them. */
      var similar = document.createElement("span");
      similar.className = "search-similar";
      similar.textContent = "similar";
      similar.title = "Find artists similar to " + artist.name;
      similar.setAttribute("role", "button");
      similar.setAttribute("tabindex", "0");
      similar.addEventListener("click", function (e) {
        e.stopPropagation();
        findSimilarArtists(artist);
      });
      similar.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          findSimilarArtists(artist);
        }
      });
      btn.appendChild(similar);

      btn.addEventListener("click", function () {
        addArtist(artist);
        els.artistSearchInput.value = "";
        hideResults();
      });
      els.searchResults.appendChild(btn);
    });
    els.searchResults.hidden = false;
  }

  function addArtist(artist) {
    if (state.selected.length >= maxArtists()) return;
    if (
      state.selected.some(function (a) {
        return a.id === artist.id;
      })
    )
      return;
    state.selected.push({
      id: artist.id,
      name: artist.name,
      image: artist.images && artist.images[2] ? artist.images[2].url : "",
      genres: artist.genres || [],
      songs: null,
    });
    renderSelected();
  }

  function removeArtist(id) {
    state.selected = state.selected.filter(function (a) {
      return a.id !== id;
    });
    renderSelected();
  }

  function renderSelected() {
    els.artistCount.textContent =
      state.selected.length + " / " + maxArtists();
    els.selectedArtists.innerHTML = "";

    if (!state.selected.length) {
      var li = document.createElement("li");
      li.className = "placeholder-row";
      li.textContent = "No artists yet — search above to add some.";
      els.selectedArtists.appendChild(li);
    } else {
      state.selected.forEach(function (a) {
        var li = document.createElement("li");
        li.appendChild(avatarEl(a.image, a.name));

        var name = document.createElement("span");
        name.className = "name";
        name.textContent = a.name;
        if (a.songs) {
          var songsLine = document.createElement("span");
          songsLine.className = "genres";
          songsLine.textContent = a.songs.length + " songs loaded";
          name.appendChild(songsLine);
        } else if (a.genres.length) {
          var g = document.createElement("span");
          g.className = "genres";
          g.textContent = a.genres.slice(0, 2).join(", ");
          name.appendChild(g);
        }
        li.appendChild(name);

        var rm = document.createElement("button");
        rm.className = "icon-btn";
        rm.type = "button";
        rm.title = "Remove " + a.name;
        rm.setAttribute("aria-label", "Remove " + a.name);
        rm.textContent = "✕";
        rm.addEventListener("click", function () {
          removeArtist(a.id);
        });
        li.appendChild(rm);

        els.selectedArtists.appendChild(li);
      });
    }

    setSearchEnabled(canUseCatalogue());
    updateBuildState();
  }

  function updateBuildState() {
    var n = state.selected.length;
    var league = isLeague();

    if (league) {
      /* A valid field needs: >=2 artists, a group count that exists, an even
       * split, and at least 2 artists per group. An odd/prime count is simply
       * impossible here, so Build stays disabled and says why. */
      var groups = effectiveGroupSplit();
      var perGroup = groups ? Math.floor(n / groups) : 0;
      var valid = n >= 2 && !!groups && n % groups === 0 && perGroup >= 2;

      els.buildBtn.disabled = !canUseCatalogue() || !valid;

      if (!n) {
        els.artistHint.textContent =
          "Group + Knockout: add artists so they can be split into groups.";
      } else if (valid) {
        els.artistHint.textContent =
          "Ready to build — " +
          n +
          " artists in " +
          groups +
          " groups of " +
          perGroup +
          " (" +
          songsPerArtist() +
          " songs each).";
      } else if (!groups) {
        els.artistHint.textContent =
          n +
          " artists can't be grouped evenly. Groups need the artist count to " +
          "divide by 2, 4 or 8 with at least 2 artists each — add or remove an " +
          "artist (" +
          (n + 1) +
          " would work for 2 groups).";
      } else {
        els.artistHint.textContent =
          groups +
          " groups need a multiple of " +
          groups +
          " artists, at least " +
          groups * 2 +
          ". You have " +
          n +
          ".";
      }
      els.artistReqPrefix.textContent = "Group + Knockout: add up to";
      els.artistReqSuffix.textContent =
        "artists, split into " + (groups || groupChoice()) + " groups.";
      els.maxArtistsText.textContent = maxArtists();
      refreshGroupControl();
      return;
    }

    els.buildBtn.disabled = !canUseCatalogue() || n < 2;
    els.artistHint.textContent =
      n === 0
        ? "Add at least 2 artists to build a bracket."
        : n === 1
          ? "Add 1 more artist to build a bracket."
          : "Ready to build.";
    els.artistReqPrefix.textContent = "Search and add up to";
    els.artistReqSuffix.textContent = "artists.";
    els.maxArtistsText.textContent = maxArtists();
  }

  /* Spell out the format's shape from the ACTUAL numbers rather than a fixed
   * description — the group count and song counts now vary. */
  function renderLeagueNotice() {
    if (!els.leagueNoticeText) return;
    var n = state.selected.length;
    var groups = effectiveGroups();
    var perArtist = songsPerArtist();

    if (!n || !groups || n % groups !== 0 || n / groups < 2) {
      els.leagueNoticeText.innerHTML =
        "<strong>Group + Knockout.</strong> Your artists are split into " +
        groupChoice() +
        " groups, and every song plays the other artists in its group. Add a " +
        "number of artists that divides evenly by the group count (at least " +
        "2 per group) to see the exact schedule.";
      els.leagueNoticeCount.textContent = "";
      return;
    }

    var perGroup = n / groups;
    var songsPerGroup = perGroup * perArtist;
    var groupMatches = groups * songsPerGroup * (perGroup - 1) / 2;

    /* Qualifying places mirror the league module: capped at 4 and trimmed until
     * the total qualifier count is a power of two. */
    var qualify = Math.min(CFG.LEAGUE.QUALIFY_PER_GROUP, songsPerGroup);
    while (qualify > 2 && !window.STLeague.isPowerOfTwo(groups * qualify)) {
      qualify--;
    }
    var qualifiers = groups * qualify;
    var koMatches = qualifiers - 1;
    var koRounds = window.STLeague.knockoutSizes(qualifiers).length;

    els.leagueNoticeText.innerHTML =
      "<strong>Group + Knockout.</strong> Your " +
      n +
      " artists are split into " +
      groups +
      " groups of " +
      perGroup +
      " artists (" +
      songsPerGroup +
      " songs each, " +
      perArtist +
      " from every artist). Each song plays " +
      (perGroup - 1) +
      " matches — one against a song from each of the other " +
      (perGroup - 1) +
      " artists in its group. The top " +
      qualify +
      " from every group qualify for the knockout.";

    els.leagueNoticeCount.innerHTML =
      "That's <strong>" +
      groupMatches +
      "</strong> group matches plus <strong>" +
      koMatches +
      "</strong> in the knockout = <strong>" +
      (groupMatches + koMatches) +
      "</strong> matches, across " +
      (1 + koRounds) +
      " rounds.";
  }

  /* Keep the group <select> honest: disable options the current artist count
   * can't support, and explain what the choice means for this many artists. */
  function refreshGroupControl() {
    if (!els.groupCount) return;
    var n = state.selected.length;

    Array.prototype.forEach.call(els.groupCount.options, function (opt) {
      var value = parseInt(opt.value, 10);
      /* The label always states the minimum artist count this needs, so the
       * requirement is visible before you have picked anything. */
      var needed = value * 2;
      var possible = n === 0 || (n % value === 0 && n / value >= 2);
      opt.disabled = !possible;
      opt.textContent =
        value +
        " groups (needs " +
        needed +
        "+ artists" +
        (possible ? ")" : ", and a multiple of " + value + ")");
    });

    /* Keep the selection on something that divides the artists evenly. */
    if (n) {
      var resolved = effectiveGroups();
      if (resolved && String(resolved) !== els.groupCount.value) {
        els.groupCount.value = String(resolved);
      }
    }

    var groups = n ? effectiveGroupSplit() : 0;
    var perGroup = groups ? Math.floor(n / groups) : null;
    var perArtist = songsPerArtist();

    if (!n) {
      els.groupsNote.textContent =
        "Each group needs at least 2 artists, and the artist count must divide " +
        "evenly between the groups.";
    } else if (!groups) {
      els.groupsNote.textContent =
        n +
        " artists can't be split into even groups — add or remove 1 artist to " +
        "make it even. Each group needs at least 2 artists.";
    } else {
      var songsPerGroup = perGroup * perArtist;
      els.groupsNote.textContent =
        groups +
        " groups of " +
        perGroup +
        " artists = " +
        songsPerGroup +
        " songs per group, " +
        groups * songsPerGroup +
        " in total. Each group runs its own round-robin, so more groups means " +
        "more matches.";
    }
  }

  /* Show the controls that only apply to the current format/song mode. */
  function refreshModeUI() {
    var league = isLeague();
    var random = getMode() === "random";
    els.groupsRow.hidden = !league;
    els.albumPanel.hidden = !random;
    if (league) refreshGroupControl();
    if (random) renderAlbumPicker();
  }

  /* Apply everything that depends on the chosen format. */
  function refreshFormatUI() {
    var league = isLeague();
    var per = songsPerArtist();

    els.maxArtistsText.textContent = maxArtists();
    els.artistReqPrefix.textContent = league
      ? "Group + Knockout: add up to"
      : "Search and add up to";
    els.artistReqSuffix.textContent = "artists.";

    els.leagueNotice.hidden = !league;
    if (league) renderLeagueNotice();
    els.songModeSubhead.textContent = league
      ? "The same rule is applied to every artist, scaled to the field size."
      : "Same rules apply to every artist.";
    els.topModeTitle.textContent = "Top " + per + " songs";
    els.randomModeTitle.textContent = per + " random songs";

    /* The artist count is not fixed, so describe the real requirement. */
    if (els.leagueFormatNote) {
      var groups2 = effectiveGroupSplit();
      els.leagueFormatNote.textContent = state.selected.length
        ? "Needs a multiple of " + groups2 + " artists, 2+ per group"
        : "2, 4 or 8 groups — the artist count must divide evenly";
    }

    refreshModeUI();
    renderSelected();
  }

  document.querySelectorAll('input[name="format"]').forEach(function (input) {
    input.addEventListener("change", refreshFormatUI);
  });

  document.querySelectorAll('input[name="songMode"]').forEach(function (input) {
    input.addEventListener("change", refreshModeUI);
  });

  if (els.groupCount) {
    els.groupCount.addEventListener("change", function () {
      updateBuildState();
    });
  }

  /* ── Song fetching ──────────────────────────────────────────────────────── */
  function toSong(track, artist) {
    var artists = track.artists || [];
    var primary = artists.length && artists[0] && artists[0].id === artist.id;
    var album = track.album || {};
    /* Album art ONLY — deliberately never the artist photo. Substituting the
     * artist's portrait here is why the card head showed a face instead of the
     * record when the album art was unavailable (some markets strip images from
     * search results). An empty image falls back to a lettered tile with the
     * SONG's initial, and the card already prints the artist name underneath. */
    var image = (album.images && album.images.length && album.images[0].url) || "";
    return {
      key: track.id,
      id: track.id,
      name: track.name,
      artistId: artist.id,
      artistName: artist.name,
      album: album.name || "",
      image: image,
      /* Kept separately for anything that legitimately wants the artist picture. */
      artistImage: artist.image || "",
      featured: !primary,
    };
  }

  /* Keep only tracks this artist is genuinely on, de-duplicated. `primaryOnly`
   * additionally requires them to be the track's main artist (i.e. drop
   * features). Filtering by id here is what guarantees we never rank a
   * same-named but different artist. */
  function collectArtistTracks(res, artist, primaryOnly) {
    var items = (res && res.tracks && res.tracks.items) || [];
    var out = [];
    var seen = {};
    items.forEach(function (t) {
      if (!t || !t.id || seen[t.id]) return;
      var artists = t.artists || [];
      var onTrack = artists.some(function (a) {
        return a.id === artist.id;
      });
      if (!onTrack) return;
      if (primaryOnly && !(artists[0] && artists[0].id === artist.id)) return;
      seen[t.id] = true;
      out.push(t);
    });
    return out;
  }

  /* NOTE: this used to rank by the track `popularity` field. Spotify deprecated
   * `popularity` (it is no longer returned at all), so there is nothing left to
   * rank by — /search already returns relevance order, which is what we keep.
   * The function is retained as a named seam so the call sites stay readable if
   * Spotify ever restores a usable ranking signal. */
  function rankByPopularity(tracks) {
    return tracks.slice();
  }

  /* Page through artist search results, stopping as soon as we have `want`
   * usable candidates. Spotify caps /search at 10 results per request and
   * `artist:"Name"` results are fuzzy (features, same-named artists), so we may
   * need several pages before enough real songs appear. */
  function searchArtistTracks(artist, primaryOnly, want) {
    var limit = CFG.SEARCH_LIMIT;
    var maxPages = CFG.TOP_SEARCH_PAGES;
    var quoted = 'artist:"' + String(artist.name).replace(/"/g, "") + '"';
    var collected = [];
    var seen = {};

    function page(i) {
      if (i >= maxPages) return Promise.resolve(collected);
      return window.STSpotify.searchTracks(quoted, limit, i * limit)
        .catch(function () {
          /* A failed later page shouldn't sink the whole artist. */
          return { tracks: { items: [] } };
        })
        .then(function (res) {
          collectArtistTracks(res, artist, primaryOnly).forEach(function (t) {
            if (!seen[t.id]) {
              seen[t.id] = true;
              collected.push(t);
            }
          });
          var got = (res.tracks && res.tracks.items) || [];
          if (collected.length >= want) return collected;
          if (got.length < limit) return collected; // last page reached
          return page(i + 1);
        });
    }

    return page(0);
  }

  /* "Top" mode. /artists/{id}/top-tracks is deprecated and returns 403, so this
   * is a reconstruction: search the catalog for the artist's tracks, filter to
   * tracks they are genuinely on, and keep Spotify's relevance order (the old
   * `popularity` tiebreaker no longer exists — see rankByPopularity). */
  function fetchTopSongs(artist, opts) {
    var primaryOnly = !opts.includeFeatured;
    var want = opts.perArtist || CFG.SONGS_PER_ARTIST;

    return searchArtistTracks(artist, primaryOnly, want)
      .then(function (tracks) {
        if (tracks.length) return tracks;
        /* The strict artist-name search found nothing — widen to a plain name
         * search (still filtered to this exact artist id, so a same-named
         * artist can't sneak in). */
        return window.STSpotify.searchTracks(
          artist.name,
          CFG.SEARCH_LIMIT,
          0,
        ).then(function (res) {
          return collectArtistTracks(res, artist, primaryOnly);
        });
      })
      .then(function (tracks) {
        var seen = {};
        return rankByPopularity(
          tracks.filter(function (t) {
            if (seen[t.id]) return false;
            seen[t.id] = true;
            return true;
          }),
        )
          .slice(0, want)
          .map(function (t) {
            return toSong(t, artist);
          });
      });
  }

  /* ── Album picker (random mode) ─────────────────────────────────────────── */
  /* Albums already chosen by the user for a given artist. Empty means "no
   * restriction", i.e. draw from the whole discography. */
  function pickedAlbumsFor(artistId) {
    return Object.keys(state.picked).filter(function (id) {
      return state.pickedBy[id] === artistId;
    });
  }

  function albumsChosen() {
    return pickedAlbumIds().length > 0;
  }

  function setAlbumStatus(msg) {
    els.albumStatus.textContent = msg || "";
  }

  /* Fetch and remember each artist's album list. Results are cached in state so
   * adding or removing an artist doesn't re-request everyone. */
  function loadAlbums() {
    if (!state.selected.length) {
      setAlbumStatus("Add some artists first.");
      return;
    }
    if (!canUseCatalogue()) {
      setAlbumStatus("Connect to Spotify first.");
      return;
    }

    var pending = state.selected.filter(function (a) {
      return !state.albums[a.id];
    });
    if (!pending.length) {
      setAlbumStatus("Albums already loaded.");
      renderAlbumPicker();
      return;
    }

    els.loadAlbumsBtn.disabled = true;
    setAlbumStatus("Loading albums…");
    var done = 0;

    Promise.all(
      pending.map(function (artist) {
        return window.STSpotify.getAllArtistAlbums(
          artist.id,
          "album,single,compilation",
          CFG.ALBUM_LIST_MAX_PAGES,
        )
          .then(function (albums) {
            state.albums[artist.id] = albums.filter(function (al) {
              return al && al.id;
            });
            done++;
            setAlbumStatus(
              "Loading albums… " + done + " of " + pending.length + " artists",
            );
          })
          .catch(function () {
            state.albums[artist.id] = [];
            done++;
          });
      }),
    ).then(function () {
      els.loadAlbumsBtn.disabled = false;
      var total = state.selected.reduce(function (n, a) {
        return n + ((state.albums[a.id] || []).length);
      }, 0);
      setAlbumStatus(
        total
          ? "Found " + total + " albums. Tick the ones to use."
          : "No albums found for these artists.",
      );
      renderAlbumPicker();
    });
  }

  function toggleAlbum(albumId, artistId) {
    if (state.picked[albumId]) {
      delete state.picked[albumId];
      delete state.pickedBy[albumId];
    } else {
      state.picked[albumId] = true;
      state.pickedBy[albumId] = artistId;
    }
    updateAlbumCounts();
  }

  /* Just refresh the per-artist counts and buttons, without rebuilding the
   * whole list (which would lose scroll position while ticking boxes). */
  function updateAlbumCounts() {
    var any = albumsChosen();
    els.clearAlbumsBtn.hidden = !any;

    state.selected.forEach(function (artist) {
      var count = pickedAlbumsFor(artist.id).length;
      var badge = els.albumPanelBody.querySelector(
        '[data-count-for="' + artist.id + '"]',
      );
      if (badge) {
        badge.textContent = count ? count + " selected" : "All albums";
        badge.classList.toggle("on", count > 0);
      }
    });
  }

  function renderAlbumPicker() {
    els.albumPanelBody.innerHTML = "";

    if (!state.selected.length) {
      var empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Add artists above, then load their albums.";
      els.albumPanelBody.appendChild(empty);
      els.clearAlbumsBtn.hidden = true;
      return;
    }

    state.selected.forEach(function (artist) {
      var box = document.createElement("div");
      box.className = "album-artist";

      var head = document.createElement("div");
      head.className = "album-artist-head";
      var name = document.createElement("strong");
      name.textContent = artist.name;
      head.appendChild(name);
      var badge = document.createElement("span");
      badge.className = "pill album-count";
      badge.setAttribute("data-count-for", artist.id);
      badge.textContent = "All albums";
      head.appendChild(badge);
      box.appendChild(head);

      var albums = state.albums[artist.id];
      if (!albums) {
        var notLoaded = document.createElement("p");
        notLoaded.className = "hint";
        notLoaded.textContent = "Not loaded yet.";
        box.appendChild(notLoaded);
      } else if (!albums.length) {
        var none = document.createElement("p");
        none.className = "hint";
        none.textContent = "No albums found.";
        box.appendChild(none);
      } else {
        var list = document.createElement("div");
        list.className = "album-list";
        albums.forEach(function (album) {
          var label = document.createElement("label");
          label.className = "album-item";

          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = !!state.picked[album.id];
          cb.addEventListener("change", function () {
            toggleAlbum(album.id, artist.id);
          });
          label.appendChild(cb);

          var img = avatarEl(
            album.images && album.images[2] && album.images[2].url,
            album.name,
          );
          img.classList.add("album-thumb");
          label.appendChild(img);

          var meta = document.createElement("span");
          meta.className = "album-meta";
          var t = document.createElement("strong");
          t.textContent = album.name;
          meta.appendChild(t);
          var sub = document.createElement("span");
          sub.textContent =
            (album.release_date || "").slice(0, 4) +
            (album.album_type ? " · " + album.album_type : "");
          meta.appendChild(sub);
          label.appendChild(meta);

          list.appendChild(label);
        });
        box.appendChild(list);
      }

      els.albumPanelBody.appendChild(box);
    });

    updateAlbumCounts();
  }

  els.loadAlbumsBtn.addEventListener("click", loadAlbums);

  els.clearAlbumsBtn.addEventListener("click", function () {
    state.picked = {};
    state.pickedBy = {};
    renderAlbumPicker();
  });

  function shuffleInPlace(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function fetchRandomSongs(artist, opts) {
    var R = CFG.RANDOM;
    var want = opts.perArtist || CFG.SONGS_PER_ARTIST;
    var chosen = pickedAlbumsFor(artist.id);

    /* When the user picked albums for this artist, draw only from those and
     * don't bother scanning the discography. */
    var albumPromise = chosen.length
      ? Promise.resolve(
          chosen.map(function (id) {
            return { id: id };
          }),
        )
      : window.STSpotify.getArtistAlbums(
          artist.id,
          "album,single,compilation",
          0,
          R.ALBUM_PAGE_SIZE,
        ).then(function (first) {
          var pageSize = (first && first.limit) || R.ALBUM_PAGE_SIZE;
          var total = (first && first.total) || 0;
          var pages = Math.min(
            R.MAX_ALBUM_PAGES,
            Math.max(1, Math.ceil(total / pageSize)),
          );
          var extras = [];
          for (var p = 1; p < pages; p++) {
            extras.push(
              window.STSpotify.getArtistAlbums(
                artist.id,
                "album,single,compilation",
                p * pageSize,
                pageSize,
              ),
            );
          }
          return Promise.all(extras).then(function (rest) {
            var all = ((first && first.items) || []).slice();
            rest.forEach(function (r) {
              all = all.concat((r && r.items) || []);
            });
            return all;
          });
        });

    return albumPromise
      .then(function (albums) {
        if (!albums.length) {
          throw new Error(
            chosen.length
              ? "the chosen albums have no tracks available"
              : "no albums available for this artist",
          );
        }
        /* Shuffling before slicing means repeated builds draw different albums.
         * With an explicit choice we keep every album, since the user asked for
         * exactly those. */
        var picks;
        if (chosen.length) {
          picks = albums.slice();
        } else {
          shuffleInPlace(albums);
          picks = albums.slice(0, R.MAX_ALBUM_FETCHES);
        }

        var fetched = picks.map(function (album) {
          return window.STSpotify.getAlbumTracks(album.id)
            .then(function (res) {
              return res.items || [];
            })
            .catch(function () {
              return [];
            });
        });

        return Promise.all(fetched).then(function (lists) {
          var seen = {};
          var candidates = [];
          lists.forEach(function (tracks) {
            tracks.forEach(function (t) {
              if (!t || !t.id || seen[t.id]) return;
              if (t.is_local) return;
              seen[t.id] = true;
              if (!opts.includeFeatured) {
                var primary =
                  t.artists && t.artists[0] && t.artists[0].id === artist.id;
                if (!primary) return;
              }
              candidates.push(t);
            });
          });
          if (!candidates.length) return [];
          shuffleInPlace(candidates);
          return candidates.slice(0, want).map(function (t) {
            return toSong(t, artist);
          });
        });
      });
  }

  /* ── Build flow ─────────────────────────────────────────────────────────── */
  els.buildBtn.addEventListener("click", function () {
    if (state.selected.length < 2) return;
    refreshConnectionUI();
    if (!canUseCatalogue()) {
      setBuildStatus(
        isPublic()
          ? "The song catalogue service isn't reachable."
          : "Connect to Spotify first.",
      );
      return;
    }

    var opts = buildOptions();
    if (opts.format === "league") {
      var groups = effectiveGroups();
      var n = state.selected.length;
      if (!groups || n % groups !== 0 || n / groups < 2) {
        setBuildStatus(
          !groups
            ? n +
              " artists can't be split into even groups. Use an even number " +
              "that divides by 2, 4 or 8, with at least 2 artists per group."
            : groups +
              " groups need a multiple of " +
              groups +
              " artists, with at least 2 per group. You have " +
              n +
              ".",
        );
        return;
      }
    }

    els.buildBtn.disabled = true;
    setBuildStatus("Fetching songs…");

    var loaded = 0;
    var skipped = [];

    var tasks = state.selected.map(function (artist) {
      var fetcher = opts.mode === "top" ? fetchTopSongs : fetchRandomSongs;
      return fetcher(artist, opts)
        .then(function (songs) {
          artist.songs = songs;
          loaded += songs.length;
          if (!songs.length) skipped.push(artist.name + " (no songs found)");
          setBuildStatus("Loaded " + loaded + " songs…");
          return songs;
        })
        .catch(function (err) {
          artist.songs = [];
          skipped.push(artist.name + " (" + err.message + ")");
          return [];
        });
    });

    Promise.all(tasks).then(function () {
      var all = [];
      var seen = {};
      state.selected.forEach(function (a) {
        (a.songs || []).forEach(function (s) {
          if (seen[s.key]) return;
          seen[s.key] = true;
          all.push(s);
        });
      });

      els.buildBtn.disabled = false;
      updateBuildState();
      renderSelected();

      /* Every artist must yield the same song count, or the groups come out
       * uneven and a group could end up with nothing to pair. The expected count
       * is whatever `songsPerArtist` asked for, not a fixed constant. */
      if (opts.format === "league") {
        var need = opts.perArtist || CFG.LEAGUE.SONGS_PER_ARTIST;
        var short = state.selected.filter(function (a) {
          return (a.songs || []).length < need;
        });
        if (short.length) {
          setBuildStatus(
            "Group + Knockout needs " +
              need +
              " songs from every artist. Not enough from: " +
              short
                .map(function (a) {
                  return a.name + " (" + (a.songs || []).length + ")";
                })
                .join(", ") +
              ".",
          );
          return;
        }
      }

      if (all.length < 2) {
        setBuildStatus(
          "Couldn't build — " +
            (skipped.length
              ? "skipped " + skipped.join(", ") + "."
              : "not enough songs found."),
        );
        return;
      }

      state.allSongs = all;
      state.options = {
        shuffleSeeds: opts.shuffleSeeds,
        groups: opts.groups,
      };
      setBuildStatus(
        skipped.length ? "Skipped " + skipped.join(", ") + "." : "",
      );
      startTournament();
    });
  });

  function startTournament() {
    state.tournament = null;
    state.league = null;

    if (isLeague()) {
      state.league = new window.STLeague.League(state.allSongs, {
        shuffle: state.options.shuffleSeeds,
        groups: state.options.groups,
      });
    } else {
      state.tournament = new window.STBracket.Tournament(
        state.allSongs,
        state.options,
      );
    }
    showScreen("tournament");
    renderTournament();
  }

  /* ── Shared tournament helpers ──────────────────────────────────────────── */
  function currentNode() {
    return isLeague() ? state.league.current() : state.tournament.current();
  }

  /* Which round arrays hold the knockout, so the champion screen can read the
   * final and semi-finals regardless of format. */
  function knockoutRounds() {
    return isLeague() ? state.league.knockoutRounds : state.tournament.rounds;
  }

  function roundName(roundIndex, rounds) {
    var matches = rounds[roundIndex].length;
    if (matches === 1) return "Final";
    if (matches === 2) return "Semi-finals";
    if (matches === 4) return "Quarter-finals";
    return "Round of " + matches * 2;
  }

  function roundLabelFor(cur) {
    if (isLeague() && cur.phase === "group") {
      var draws = state.league.groupRounds;
      return (
        "Group stage · Draw " +
        (cur.round + 1) +
        " of " +
        draws.length +
        " · match " +
        (cur.index + 1) +
        " of " +
        draws[cur.round].length
      );
    }
    var rounds = knockoutRounds();
    return (
      roundName(cur.round, rounds) +
      " · " +
      (cur.index + 1) +
      " of " +
      rounds[cur.round].length
    );
  }

  /* key → "eliminated" | "qualified", used for the card tags. */
  function songStatusMap() {
    var status = {};

    if (isLeague()) {
      var l = state.league;

      /* A song is only out of the league once the group stage is complete and it
       * missed the qualifying places. */
      var groupComplete = l.groupRounds.every(function (round) {
        return round.every(function (m) {
          return !(m.a && m.b) || m.winner !== undefined;
        });
      });
      l.groups.forEach(function (grp) {
        grp.table.forEach(function (row, idx) {
          if (groupComplete) {
            status[row.song.key] = idx < l.qualify ? "qualified" : "eliminated";
          }
        });
      });

      /* Losing any knockout match is decisive. */
      l.knockoutRounds.forEach(function (round) {
        round.forEach(function (m) {
          if (m.winner === undefined || !m.a || !m.b) return;
          var loser = m.winner === m.a ? m.b : m.a;
          if (loser) status[loser.key] = "eliminated";
        });
      });
      return status;
    }

    state.tournament.rounds.forEach(function (round) {
      round.forEach(function (m) {
        if (m.winner === undefined || !m.a || !m.b) return;
        var loser = m.winner === m.a ? m.b : m.a;
        if (loser) status[loser.key] = "eliminated";
      });
    });
    return status;
  }

  /* ── Rendering ──────────────────────────────────────────────────────────── */
  function renderTournament() {
    var cur = currentNode();
    var status = songStatusMap();

    if (isLeague()) {
      var l = state.league;
      setProgress(l.playedCount(), l.totalPlayable());
      els.undoBtn.disabled = !l.canUndo();
      renderLeagueStageProgress();
      renderStandings();
      els.summaryLabel.textContent = "Knockout bracket";
      /* The knockout lives above the group tables and is revealed as soon as the
       * group stage is decided (its first round only fills in at that point). */
      els.bracketDetails.hidden = !knockoutHasMatches();
    } else {
      var t = state.tournament;
      setProgress(t.playedCount(), t.playableCount());
      els.undoBtn.disabled = !t.canUndo();
      els.stageProgress.hidden = true;
      els.standingsWrap.hidden = true;
      els.summaryLabel.textContent = "Full bracket";
      els.bracketDetails.hidden = false;
    }

    if (!cur) {
      showChampion();
      return;
    }

    els.roundLabel.textContent = roundLabelFor(cur);
    renderMatchup(cur, status);
    renderBracketView(isLeague() && cur.phase === "knockout" ? cur.match : null);
  }

  /* True once the knockout bracket actually holds a pairing. Before the group
   * stage finishes every knockout slot is empty, so showing the panel would just
   * be eight boxes reading "TBD". */
  function knockoutHasMatches() {
    return knockoutRounds().some(function (round) {
      return round.some(function (m) {
        return !!(m.a && m.b);
      });
    });
  }

  function setProgress(played, total) {
    els.progressText.textContent = played + " / " + total + " decided";
    els.progressBarInner.style.width =
      (total ? Math.round((played / total) * 100) : 0) + "%";
  }

  function setStageProgress(played, total) {
    els.stageText.textContent = played + " / " + total;
    els.stageBarInner.style.width =
      (total ? Math.round((played / total) * 100) : 0) + "%";
  }

  function renderLeagueStageProgress() {
    var l = state.league;
    var groupTotal = 0;
    var groupPlayed = 0;
    l.groupRounds.forEach(function (round) {
      round.forEach(function (m) {
        if (!m.a || !m.b) return;
        groupTotal++;
        if (m.winner !== undefined) groupPlayed++;
      });
    });
    var koTotal = 0;
    var koPlayed = 0;
    l.knockoutRounds.forEach(function (round) {
      round.forEach(function (m) {
        if (!m.a || !m.b) return;
        koTotal++;
        if (m.winner !== undefined) koPlayed++;
      });
    });

    els.stageProgress.hidden = false;
    var groupDone = groupTotal > 0 && groupPlayed >= groupTotal;
    if (groupDone) {
      els.stageLabel.textContent = "Knockout";
      setStageProgress(koPlayed, koTotal);
    } else {
      els.stageLabel.textContent = "Group stage";
      setStageProgress(groupPlayed, groupTotal);
    }
  }

  function buildSongCard(song, side, cur, status) {
    var card = document.createElement("div");
    card.className = "song-card";

    var head = document.createElement("div");
    head.className = "song-head";
    head.appendChild(avatarEl(song.image, song.name));
    var t = document.createElement("div");
    t.className = "t";
    var strong = document.createElement("strong");
    strong.textContent = song.name;
    t.appendChild(strong);
    var by = document.createElement("span");
    by.textContent = song.artistName;
    t.appendChild(by);
    head.appendChild(t);
    card.appendChild(head);

    var tags = document.createElement("div");
    tags.className = "tag-row";
    tags.appendChild(
      tag(song.featured ? "Featured" : "Primary", !song.featured),
    );
    if (song.album) tags.appendChild(tag(song.album));
    var st = status[song.key];
    if (st === "eliminated") tags.appendChild(tag("Eliminated"));
    else if (st === "qualified") tags.appendChild(tag("Qualified"));
    card.appendChild(tags);

    var embed = document.createElement("div");
    embed.className = "embed-slot";
    renderPlayer(embed, { type: "track", id: song.id, title: song.name }, 152);
    card.appendChild(embed);

    /* Open-in-Spotify + (optionally) a note that only a preview is played.
     * Both sit below the player so they can't obscure it. */
    var meta = document.createElement("div");
    meta.className = "player-meta";

    var open = document.createElement("a");
    open.className = "open-in-spotify";
    open.href = "https://open.spotify.com/track/" + song.id;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "Open in Spotify ↗";
    meta.appendChild(open);

    var seconds = playSeconds();
    if (seconds > 0) {
      var clip = document.createElement("span");
      clip.className = "clip-badge";
      clip.textContent = seconds + "s clip";
      meta.appendChild(clip);
    }
    card.appendChild(meta);

    /* Tint the card from the album art (no-op if the art can't be read). */
    if (window.STColors) window.STColors.apply(card, song);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary vote-btn";
    btn.textContent = "Pick this song →";
    btn.addEventListener("click", function () {
      if (isLeague()) state.league.pick(cur.match, side);
      else state.tournament.pick(cur.round, cur.index, side);
      renderTournament();
    });
    card.appendChild(btn);

    return card;
  }

  function renderMatchup(cur, status) {
    /* Tear down the previous matchup's embeds first — leaving them alive would
     * keep up to 2 old players running (and audible) behind the new cards. */
    if (window.STPlayer) window.STPlayer.clear();

    els.matchup.innerHTML = "";
    els.matchup.appendChild(buildSongCard(cur.match.a, "a", cur, status));

    var vs = document.createElement("div");
    vs.className = "vs-badge";
    vs.textContent = "VS";
    els.matchup.appendChild(vs);

    els.matchup.appendChild(buildSongCard(cur.match.b, "b", cur, status));
  }

  function slotEl(song, match, roundIndex) {
    var div = document.createElement("div");
    div.className = "slot";

    if (!song) {
      div.classList.add("empty");
      if (roundIndex === 0 && match.winner !== undefined) div.textContent = "Bye";
      else div.textContent = match.winner === undefined ? "TBD" : "—";
      return div;
    }

    var name = document.createElement("span");
    name.className = "slot-name";
    name.textContent = song.name;

    var artist = document.createElement("span");
    artist.className = "slot-artist";
    artist.textContent = song.artistName;

    div.appendChild(name);
    div.appendChild(artist);

    if (match.winner !== undefined) {
      if (match.winner === song) div.classList.add("won");
      else div.classList.add("lost");
    }
    return div;
  }

  function renderBracketView(playingMatch) {
    var rounds = knockoutRounds();
    els.bracket.innerHTML = "";

    /* The first round has the most matches, so its natural height defines the
     * bracket's height — leaving `space-around` ZERO free space to distribute
     * and making those matches sit flush against each other. Setting a min-height
     * from the largest round guarantees free space exists, so every round gets
     * even breathing room and the centres still line up. */
    var maxMatches = rounds.reduce(function (max, round) {
      return Math.max(max, round.length);
    }, 1);
    els.bracket.style.minHeight = maxMatches * 90 + "px";

    rounds.forEach(function (round, r) {
      var col = document.createElement("div");
      col.className = "bracket-round";

      var h = document.createElement("h4");
      h.textContent = roundName(r, rounds);
      col.appendChild(h);

      /* Matches live in their own flex column so only THEY get distributed —
       * this is what keeps each match centred between its two feeders. */
      var matches = document.createElement("div");
      matches.className = "bracket-matches";

      round.forEach(function (m) {
        var card = document.createElement("div");
        card.className = "bracket-match";
        var isPlaying = playingMatch && m === playingMatch;
        var isOpen = m.a && m.b && m.winner === undefined;
        if (isOpen) card.classList.add("active");
        /* The matchup being played right now gets a stronger highlight than the
         * merely-available ones, so it is easy to find in a big bracket. */
        if (isPlaying) card.classList.add("playing");
        card.appendChild(slotEl(m.a, m, r));
        card.appendChild(slotEl(m.b, m, r));
        matches.appendChild(card);
      });

      col.appendChild(matches);
      els.bracket.appendChild(col);
    });
  }

  /* ── League standings ──────────────────────────────────────────────────── */
  function renderStandings() {
    if (!isLeague()) {
      els.standingsWrap.hidden = true;
      return;
    }
    els.standingsWrap.hidden = false;
    els.standingsWrap.innerHTML = "";

    /* The two songs currently head-to-head, so their rows can be highlighted.
     * This covers a group draw as well as a knockout match. */
    var cur = state.league.current();
    var playing = {};
    if (cur && cur.match.a && cur.match.b) {
      playing[cur.match.a.key] = true;
      playing[cur.match.b.key] = true;
    }

    state.league.groups.forEach(function (grp) {
      var box = document.createElement("div");
      box.className = "standings";

      var h = document.createElement("h3");
      h.textContent = grp.name;
      box.appendChild(h);

      var note = document.createElement("p");
      note.className = "qualify-note";
      note.textContent = "Top " + state.league.qualify + " qualify";
      box.appendChild(note);

      var table = document.createElement("table");
      var thead = document.createElement("thead");
      var hrow = document.createElement("tr");
      ["#", "Song", "W", "L", "Pts"].forEach(function (label, i) {
        var th = document.createElement("th");
        th.textContent = label;
        if (i > 1) th.className = "num";
        hrow.appendChild(th);
      });
      thead.appendChild(hrow);
      table.appendChild(thead);

      var tbody = document.createElement("tbody");
      grp.table.forEach(function (row, idx) {
        var tr = document.createElement("tr");
        var qualifier = idx < state.league.qualify;

        var pos = document.createElement("td");
        pos.className = "num";
        pos.textContent = idx + 1;
        tr.appendChild(pos);

        var team = document.createElement("td");
        team.className = "team";
        var strong = document.createElement("strong");
        strong.textContent = row.song.name;
        team.appendChild(strong);
        var span = document.createElement("span");
        span.textContent = row.song.artistName;
        team.appendChild(span);
        tr.appendChild(team);

        [row.wins, row.losses, row.points].forEach(function (val, i) {
          var td = document.createElement("td");
          td.className = i === 2 ? "num pts" : "num";
          td.textContent = val;
          tr.appendChild(td);
        });

        /* Only colour the qualification line once results mean something. */
        if (row.played > 0) {
          tr.className = qualifier ? "qualifies" : "out";
        }
        /* Yellow wins over the qualify/out tint for the songs in play. */
        if (playing[row.song.key]) {
          tr.classList.add("playing");
          tr.classList.remove("out");
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.appendChild(table);

      els.standingsWrap.appendChild(box);
    });
  }

  els.undoBtn.addEventListener("click", function () {
    var ok = isLeague() ? state.league.undo() : state.tournament.undo();
    if (ok) {
      showScreen("tournament");
      renderTournament();
    }
  });

  function backToSetup() {
    state.tournament = null;
    state.league = null;
    setBuildStatus("");
    showScreen("setup");
  }

  els.resetBtn.addEventListener("click", backToSetup);

  /* ── Champion ───────────────────────────────────────────────────────────── */
  function showChampion() {
    var champ = isLeague() ? state.league.champion() : state.tournament.champion();
    if (!champ) return;

    var rounds = knockoutRounds();
    var final = rounds[rounds.length - 1][0];
    var runnerUp = final.a === champ ? final.b : final.a;

    var thirds = [];
    if (rounds.length >= 2) {
      rounds[rounds.length - 2].forEach(function (m) {
        if (m.winner === undefined || !m.a || !m.b) return;
        var loser = m.winner === m.a ? m.b : m.a;
        if (loser) thirds.push(loser);
      });
    }

    els.championTitle.textContent = champ.name;
    els.championArtist.textContent =
      champ.artistName + (champ.album ? " · " + champ.album : "");
    if (window.STPlayer) window.STPlayer.clear();
    renderPlayer(
      els.championEmbed,
      { type: "track", id: champ.id, title: champ.name },
      232,
    );

    els.podiumList.innerHTML = "";
    addPodium(1, champ, "Champion");
    if (runnerUp) addPodium(2, runnerUp, "Runner-up");
    thirds.forEach(function (song) {
      addPodium(3, song, "Joint third");
    });

    renderPodiumStage(champ, runnerUp, thirds);

    showScreen("champion");
  }

  /* The visual podium: 2nd, 1st, 3rd left to right, each a pillar whose height
   * encodes the placing, with the album cover floating above it. Built as plain
   * divs — the 3D feel is pure CSS (perspective, rotateX, layered shadows). */
  function renderPodiumStage(champ, runnerUp, thirds) {
    els.podiumStage.innerHTML = "";
    if (!champ) return;

    var order = [
      { place: 2, song: runnerUp, label: "2nd" },
      { place: 1, song: champ, label: "1st" },
      { place: 3, song: thirds[0], label: "3rd" },
    ];

    order.forEach(function (entry) {
      if (!entry.song) return;
      var song = entry.song;

      var col = document.createElement("div");
      col.className = "podium-col place-" + entry.place;

      /* Album cover — floats above the pillar. */
      var art = document.createElement("div");
      art.className = "podium-art";
      if (song.image) {
        var img = document.createElement("img");
        img.src = song.image;
        img.alt = song.name;
        img.loading = "lazy";
        img.onerror = function () {
          this.replaceWith(fallbackAvatar(song.name));
        };
        art.appendChild(img);
      } else {
        art.appendChild(fallbackAvatar(song.name));
      }
      col.appendChild(art);

      var meta = document.createElement("div");
      meta.className = "podium-meta";
      var t = document.createElement("strong");
      t.textContent = song.name;
      meta.appendChild(t);
      var a = document.createElement("span");
      a.textContent = song.artistName;
      meta.appendChild(a);
      col.appendChild(meta);

      var pillar = document.createElement("div");
      pillar.className = "podium-pillar";
      var num = document.createElement("span");
      num.textContent = entry.place;
      pillar.appendChild(num);
      var place = document.createElement("em");
      place.textContent = entry.label;
      pillar.appendChild(place);
      col.appendChild(pillar);

      /* Extra third-place entries share the same pillar, listed beside it. */
      if (entry.place === 3 && thirds.length > 1) {
        var extra = document.createElement("div");
        extra.className = "podium-extra";
        thirds.slice(1).forEach(function (song2) {
          var row = document.createElement("span");
          row.textContent = song2.name + " — " + song2.artistName;
          extra.appendChild(row);
        });
        col.appendChild(extra);
      }

      els.podiumStage.appendChild(col);
    });
  }

  function addPodium(place, song, label) {
    var li = document.createElement("li");
    var strong = document.createElement("strong");
    strong.textContent = song.name;
    var span = document.createElement("span");
    span.textContent = " — " + song.artistName + " (" + label + ")";
    li.appendChild(strong);
    li.appendChild(span);
    els.podiumList.appendChild(li);
  }

  els.playAgainBtn.addEventListener("click", function () {
    if (!state.allSongs.length) return;
    startTournament();
  });

  /* Step back into the bracket from the podium, e.g. to change the final. */
  els.championUndoBtn.addEventListener("click", function () {
    var ok = isLeague() ? state.league.undo() : state.tournament.undo();
    if (ok) {
      showScreen("tournament");
      renderTournament();
    }
  });

  els.newTournamentBtn.addEventListener("click", function () {
    state.selected.forEach(function (a) {
      a.songs = null;
    });
    backToSetup();
    renderSelected();
  });

  /* ── Boot ───────────────────────────────────────────────────────────────── */
  function boot() {
    els.redirectUriText.textContent = window.STAuth.getRedirectUri();
    els.clientIdInput.value = window.STAuth.getClientId();
    refreshFormatUI();

    /* Public mode: no login, no redirect to handle — just confirm the service
     * answers so the user finds out immediately rather than after typing. */
    if (isPublic()) {
      refreshConnectionUI();
      probeProxy();
      return;
    }

    window.STAuth.handleRedirect()
      .then(function (tokens) {
        refreshConnectionUI();
        if (tokens) loadMe();
        else if (window.STAuth.isLoggedIn()) loadMe();
      })
      .catch(function (err) {
        refreshConnectionUI();
        explainConnectionError(err);
      });
  }

  boot();
})();
