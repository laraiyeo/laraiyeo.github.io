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
      explicitMode: els.explicitMode ? els.explicitMode.value : "explicit",
      perArtist: songsPerArtist(),
      format: getFormat(),
      groups: groupChoice(),
    };
  }

  var els = {
    connDot: $("connDot"),
    connStatus: $("connStatus"),
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
    explicitMode: $("explicitMode"),
    groupsRow: $("groupsRow"),
    groupCount: $("groupCount"),
    groupsNote: $("groupsNote"),
    albumPanel: $("albumPanel"),
    albumPanelBody: $("albumPanelBody"),
    loadAlbumsBtn: $("loadAlbumsBtn"),
    clearAlbumsBtn: $("clearAlbumsBtn"),
    albumStatus: $("albumStatus"),
    albumContentModal: $("albumContentModal"),
    albumContentCancel: $("albumContentCancel"),
    albumContentConfirm: $("albumContentConfirm"),
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
    tiePanel: $("tiePanel"),
    tieTitle: $("tieTitle"),
    tieText: $("tieText"),
    tieModes: $("tieModes"),
    tieManualBtn: $("tieManualBtn"),
    tieRandomBtn: $("tieRandomBtn"),
    tiePlayoffBtn: $("tiePlayoffBtn"),
    tieManualDesc: $("tieManualDesc"),
    tieRandomDesc: $("tieRandomDesc"),
    tiePlayoffDesc: $("tiePlayoffDesc"),
    tieBody: $("tieBody"),
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
    /* Song content the album list was loaded with ("explicit" | "clean" |
     * "any"). Apple lists both editions of a release, so the picker is only
     * ever filled with one of them. */
    albumContent: null,
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

  /* ── Access mode ────────────────────────────────────────────────────────── */
  /* True when the catalogue proxy is configured. The proxy holds the Apple
   * credentials server-side, so visitors never log in to anything. */
  function isPublic() {
    return !!(
      window.STSpotify &&
      window.STSpotify.isPublic &&
      window.STSpotify.isPublic()
    );
  }

  /* Which songs are available is the real gate on building. */
  function canUseCatalogue() {
    return !state.connError;
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
    return CFG.MAX_ARTISTS || 16;
  }

  /* How many songs each artist contributes. Fixed per format rather than scaled
   * by field size: a knockout bracket always uses SONGS_PER_ARTIST (10) and
   * Group + Knockout uses LEAGUE.SONGS_PER_ARTIST (8). The league needs fewer
   * because every song plays several round-robin matches, so the same total
   * would make the group stage far longer than a bracket. */
  function songsPerArtist() {
    return isLeague()
      ? CFG.LEAGUE.SONGS_PER_ARTIST || 8
      : CFG.SONGS_PER_ARTIST || 10;
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
  /* Clip length for the current player. Apple supplies one ~30-second preview
   * per track, so this is a fixed window rather than a user choice. */
  function playSeconds() {
    return CFG.PLAY_SECONDS || 30;
  }

  /* Render a preview player for one song into `container`. Goes through the
   * player module so clip mode can auto-stop. */
  function renderPlayer(container, obj, height) {
    if (!obj.previewUrl) {
      fillEmbed(container);
      return;
    }
    window.STPlayer.mount(container, {
      height: height,
      clipSeconds: playSeconds(),
      title: obj.title,
      previewUrl: obj.previewUrl,
      image: obj.image,
      artistName: obj.artistName,
      isExplicit: obj.isExplicit,
      bgColor: obj.bgColor,
      releaseDate: obj.releaseDate,
      genres: obj.genres,
      durationMs: obj.durationMs,
      trackUrl: obj.trackUrl,
      /* Set by callers that already render the metadata chips on the card, so
       * the player does not repeat them. */
      chipsOnCard: obj.chipsOnCard,
    });
  }

  /* Shown when a track has no Apple preview URL. */
  function fillEmbed(container) {
    container.innerHTML = "";
    var note = document.createElement("div");
    note.className = "preview-unavailable";
    note.textContent = "No preview available for this track.";
    container.appendChild(note);
  }

  function showScreen(name) {
    if (window.STPlayer) window.STPlayer.clear();
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
    var refused = state.connErrorStatus === 403;

    els.connDot.classList.toggle("on", !state.connError);
    els.connDot.classList.toggle("bad", !!state.connError);
    els.connStatus.textContent = state.connError
      ? refused
        ? "Catalogue service refused"
        : "Catalogue service unavailable"
      : "Apple Music Catalogue";
    els.artistSearchInput.disabled = !!state.connError;
    els.genreSearchInput.disabled = !!state.connError;
    els.genreSearchBtn.disabled = !!state.connError;
    updateBuildState();
  }

  /* Surface catalogue failures in the Ready-to-play panel. */
  function explainConnectionError(err) {
    var reason = (err && err.message) || "It didn't respond.";
    els.publicHint.textContent =
      "Couldn't reach the Apple Music Catalogue. " +
      (reason.indexOf(".") === reason.length - 1 ? reason : reason + ".");
    return false;
  }

  /* Confirm the catalogue service answers before the user starts typing. */
  function probeProxy() {
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

  /* ── Artist search ──────────────────────────────────────────────────────── */
  els.artistSearchInput.addEventListener("input", function () {
    if (!els.artistSearchInput.value.trim()) hideResults();
  });

  els.artistSearchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      var val = els.artistSearchInput.value.trim();
      if (val.length < 2) {
        hideResults();
        return;
      }
      els.searchSpinner.hidden = false;
      runSearch(val);
    } else if (e.key === "Escape") {
      hideResults();
    }
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
    window.STSpotify.searchArtists(query, 5)
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

  /* ── Artist discovery ───────────────────────────────────────────────────── */
  /* Apple Music has no related-artists endpoint, so there is no "similar"
   * feature. The genre box asks the user for a genre rather than pretending we
   * can derive one, because artist genre tags are sparse and unreliable across
   * the catalogue. */

  var COVER_NOISE =
    /karaoke|tribute|cover band|cover version|sped up|slowed|8[- ]?bit|lullaby|made famous|in the style of|instrumental version|greatest hits|radio edit/i;

  /* Turn search results into a usable candidate list: drop the artist itself,
   * anyone already in the field, covers/karaoke, and duplicate names. */
  function dedupeCandidates(artist, items) {
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

  /* Genre discovery — the only route from "a vibe" to artists. */
  function runGenreSearch() {
    var genre = els.genreSearchInput.value.trim();
    if (genre.length < 2) return;

    els.searchSpinner.hidden = false;
    showResultsMessage("Finding artists tagged " + genre + "…");

    window.STSpotify.searchArtistsByGenre([genre], 5)
      .then(function (res) {
        var fresh = dedupeCandidates(
          null,
          (res && res.artists && res.artists.items) || [],
        );
        if (!fresh.length) {
          showResultsMessage(
            'Nothing found for "' +
              genre +
              '". Try a broader genre like "indie rock", "pop" or "hip hop".',
          );
          return;
        }
        renderSearchResults(fresh);
        els.artistSearchInput.value = genre;
      })
      .catch(function (err) {
        showResultsMessage(
          "Genre search failed. " + ((err && err.message) || ""),
        );
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
      btn.appendChild(
        avatarEl(
          artist.images && artist.images[2] && artist.images[2].url,
          artist.name,
        ),
      );

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
    els.artistCount.textContent = state.selected.length + " / " + maxArtists();
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
      /* The notice spells out the schedule from the group count, so it has to be
       * repainted here too — changing the group <select> only calls this. */
      renderLeagueNotice();
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
    /* Ask the league module how many matches a song actually plays rather than
     * assuming one per rival: the schedule deliberately plays each song twice
     * so the table separates the field. */
    var perSong = window.STLeague.groupMatchesPerSong(perGroup);
    var groupMatches = (groups * songsPerGroup * perSong) / 2;

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
      perSong +
      (perSong === 1 ? " match" : " matches") +
      " against the other " +
      (perGroup - 1) +
      (perGroup - 1 === 1 ? " artist" : " artists") +
      " in its group. The top " +
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
      ? "The same rule is applied to every artist."
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
  /* Is the selected artist a primary credit, or only a feature on this song?
   *
   * The rule is credit-string based, because Apple's per-song relationships are
   * usually absent and the artist id cannot be trusted for this: a song is a
   * feature when the artist appears in the track title but NOT in `artistName`.
   * Appearing in both (or only in `artistName`) means they hold the primary
   * credit. Titles name features inside parentheses or after "feat.", so both
   * sides are normalised before comparing.
   *
   * Returns { featured, primary } — `primary` matches Apple's own
   * `artistName` field rather than the internal artist id, which is what the
   * "Primary"/"Featured" tag and the featured-only filter both key off. */
  function creditInfo(track, artist) {
    var artistName = String(track.artistName || "").toLowerCase();
    var name = String(artist.name || "").trim();
    var lower = name.toLowerCase();
    var title = String(track.name || "").toLowerCase();

    var inArtistName = !!lower && artistName.indexOf(lower) !== -1;
    var inTitle = !!lower && title.indexOf(lower) !== -1;
    var featured = inTitle && !inArtistName;

    return {
      featured: featured,
      /* The primary credit is Apple's `artistName` when nothing marks a
       * feature; a title-only credit is by definition not primary. */
      primary: !featured && inArtistName,
    };
  }

  function toSong(track, artist) {
    var credit = creditInfo(track, artist);
    var album = track.album || {};
    /* Album art ONLY — deliberately never the artist photo. Substituting the
     * artist's portrait here is why the card head showed a face instead of the
     * record when the album art was unavailable (some markets strip images from
     * search results). An empty image falls back to a lettered tile with the
     * SONG's initial, and the card already prints the artist name underneath. */
    var image =
      (album.images && album.images.length && album.images[0].url) || "";
    return {
      /* Artist-scoped so the SAME track can legitimately appear under two
       * selected artists — e.g. a Drake song also credited to Travis Scott. A
       * raw track id would collide, which is what previously cost an artist a
       * song and left its group one short. `id` keeps the real Apple id. */
      key: artist.id + ":" + track.id,
      id: track.id,
      name: track.name,
      artistId: artist.id,
      artistName: artist.name,
      album: album.name || "",
      image: image,
      /* Kept separately for anything that legitimately wants the artist picture. */
      artistImage: artist.image || "",
      featured: credit.featured,
      primary: credit.primary,
      previewUrl: track.preview_url || "",
      contentRating: track.content_rating || "clean",
      isExplicit:
        track.is_explicit === true || track.content_rating === "explicit",
      trackUrl:
        track.external_urls && track.external_urls.appleMusic
          ? track.external_urls.appleMusic
          : "",
      bgColor: track.bg_color || "",
      textColors: track.text_colors || [],
      releaseDate: track.release_date || "",
      genres: track.genres || [],
      durationMs: track.duration_ms || 0,
    };
  }

  /* Keep only tracks this artist is genuinely on, de-duplicated. `primaryOnly`
   * additionally drops features, using the credit rule above. */
  function collectArtistTracks(res, artist, primaryOnly) {
    var items = (res && res.tracks && res.tracks.items) || [];
    var out = [];
    var seen = {};
    items.forEach(function (t) {
      if (!t || !t.id || seen[t.id]) return;
      var credit = creditInfo(t, artist);
      /* The artist must be credited on the track at all: either in the artist
       * string or named in the title as a feature. */
      if (!credit.primary && !credit.featured) return;
      if (primaryOnly && credit.featured) return;
      seen[t.id] = true;
      out.push(t);
    });
    return out;
  }

  /* Apple's top-songs endpoint already returns popularity order, so there is
   * nothing to re-rank. Kept as a named seam so the call sites stay readable
   * and a future ranking signal has an obvious home. */
  function rankByPopularity(tracks) {
    return tracks.slice();
  }

  function matchesContentRating(track, explicitMode) {
    if (!explicitMode || explicitMode === "any") return true;
    var explicit =
      track.is_explicit === true || track.content_rating === "explicit";
    return explicitMode === "explicit" ? explicit : !explicit;
  }

  /* Page through artist search results, stopping as soon as we have `want`
   * usable candidates. Search returns fuzzy matches (features, same-named
   * artists), so we may need several pages before enough real songs appear. */
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

  /* "Top" mode. Prefers Apple's ranked top-songs endpoint; if that is
   * unavailable it falls back to reconstructing the list from track search,
   * filtered to songs the artist is genuinely on. */
  function fetchTopSongs(artist, opts) {
    var primaryOnly = !opts.includeFeatured;
    var want = opts.perArtist || songsPerArtist();

    return window.STSpotify.getTopSongs(artist.id, 25)
      .then(function (tracks) {
        var items = (tracks.tracks && tracks.tracks.items) || [];
        return items.filter(function (track) {
          return matchesContentRating(track, opts.explicitMode);
        });
      })
      .catch(function () {
        return searchArtistTracks(artist, primaryOnly, want);
      })
      .then(function (tracks) {
        var seen = {};
        return rankByPopularity(
          tracks.filter(function (t) {
            if (seen[t.id]) return false;
            seen[t.id] = true;
            return matchesContentRating(t, opts.explicitMode);
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

  /* Albums and singles listed separately: albums (and compilations) first, then
   * singles, each newest-first. Apple's own `isSingle` flag is unreliable — many
   * releases titled "- Single" come back as full albums — so the title is
   * checked too. */
  function isSingleRelease(album) {
    if (album.album_type === "single") return true;
    return /-\s*(single|ep)\b/i.test(String(album.name || ""));
  }

  function sortAlbums(list) {
    function rank(album) {
      return isSingleRelease(album) ? 1 : 0;
    }
    function year(album) {
      var y = parseInt(String(album.release_date || "").slice(0, 4), 10);
      return isNaN(y) ? 0 : y;
    }
    return list.slice().sort(function (a, b) {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (year(a) !== year(b)) return year(b) - year(a);
      return String(a.name).localeCompare(String(b.name));
    });
  }

  function setAlbumStatus(msg) {
    els.albumStatus.textContent = msg || "";
  }

  /* ── Album content confirmation ─────────────────────────────────────────── */
  /* Apple lists the explicit and clean editions of a release as two separate
   * albums, so an unfiltered discography shows the same record twice. Before
   * any albums are fetched the player confirms which content they want, and
   * only that edition of each release is listed. */
  function openAlbumContentModal() {
    var current =
      state.albumContent ||
      (els.explicitMode ? els.explicitMode.value : "explicit") ||
      "explicit";
    var radios = els.albumContentModal.querySelectorAll(
      'input[name="albumContent"]',
    );
    Array.prototype.forEach.call(radios, function (radio) {
      radio.checked = radio.value === current;
    });
    els.albumContentModal.hidden = false;
    var checked = els.albumContentModal.querySelector(
      'input[name="albumContent"]:checked',
    );
    if (checked) checked.focus();
  }

  function closeAlbumContentModal() {
    els.albumContentModal.hidden = true;
  }

  function chosenAlbumContent() {
    var checked = els.albumContentModal.querySelector(
      'input[name="albumContent"]:checked',
    );
    return checked ? checked.value : "explicit";
  }

  /* Fetch and remember each artist's album list. Results are cached in state so
   * adding or removing an artist doesn't re-request everyone. */
  function loadAlbums(contentMode) {
    if (!state.selected.length) {
      setAlbumStatus("Add some artists first.");
      return;
    }
    if (!canUseCatalogue()) {
      setAlbumStatus("The song catalogue service isn't reachable.");
      return;
    }

    /* A different content choice invalidates every cached list: the editions
     * kept for one mode are the wrong ones for another. */
    if (state.albumContent && state.albumContent !== contentMode) {
      state.albums = {};
      state.picked = {};
      state.pickedBy = {};
    }
    state.albumContent = contentMode;

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
          contentMode,
        )
          .then(function (albums) {
            state.albums[artist.id] = sortAlbums(
              albums.filter(function (al) {
                return al && al.id;
              }),
            );
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
        return n + (state.albums[a.id] || []).length;
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

  els.loadAlbumsBtn.addEventListener("click", function () {
    if (!state.selected.length) {
      setAlbumStatus("Add some artists first.");
      return;
    }
    if (!canUseCatalogue()) {
      setAlbumStatus("The song catalogue service isn't reachable.");
      return;
    }
    openAlbumContentModal();
  });

  els.albumContentCancel.addEventListener("click", closeAlbumContentModal);

  els.albumContentConfirm.addEventListener("click", function () {
    var mode = chosenAlbumContent();
    closeAlbumContentModal();
    /* Keep the setup screen's Song content control in step: the albums listed
     * and the tracks drawn from them must agree on explicit vs clean. */
    if (els.explicitMode) els.explicitMode.value = mode;
    loadAlbums(mode);
  });

  /* Clicking the backdrop (but not the card) dismisses the dialog. */
  els.albumContentModal.addEventListener("click", function (e) {
    if (e.target === els.albumContentModal) closeAlbumContentModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !els.albumContentModal.hidden) {
      closeAlbumContentModal();
    }
  });

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
    var want = opts.perArtist || songsPerArtist();
    var chosen = pickedAlbumsFor(artist.id);

    /* Which release types the automatic discography scan considers. Singles are
     * skipped by default: a single's track lookup yields one or two songs where
     * an album yields ten or more, so excluding them makes the whole scan
     * cheaper. An artist with no full releases falls back below to a scan that
     * includes singles, so a singles-only artist still gets songs. */
    var includeSingles = R.INCLUDE_SINGLES === true;
    var scanGroups = includeSingles
      ? "album,single,compilation"
      : "album,compilation";

    /* When the user picked albums for this artist, draw only from those and
     * don't bother scanning the discography. */
    var albumPromise = chosen.length
      ? Promise.resolve(
          chosen.map(function (id) {
            return { id: id };
          }),
        )
      : scanAlbums(scanGroups, R.MAX_ALBUM_PAGES);

    function scanAlbums(groups, maxPages) {
      return window.STSpotify.getArtistAlbums(
        artist.id,
        groups,
        0,
        R.ALBUM_PAGE_SIZE,
        opts.explicitMode,
      ).then(function (first) {
        /* Page by Apple's own "was the raw page full" signal rather than by
         * a total count. The per-page `total` only describes that page, and
         * dedup can shrink a full page below the page size — so a count-based
         * page number would either stop after one page or overshoot. */
        var pageSize = (first && first.limit) || R.ALBUM_PAGE_SIZE;
        var all = ((first && first.items) || []).slice();
        var wanted = Math.min(maxPages, CFG.ALBUM_LIST_MAX_PAGES || 8);

        function next(p, more) {
          if (!more || p >= wanted) return Promise.resolve(all);
          return window.STSpotify.getArtistAlbums(
            artist.id,
            groups,
            p * pageSize,
            pageSize,
            opts.explicitMode,
          ).then(function (res) {
            all = all.concat((res && res.items) || []);
            return next(p + 1, res && res.hasMore === true);
          });
        }

        return next(1, first && first.hasMore === true);
      });
    }

    return albumPromise.then(function (albums) {
      /* Singles-only artist: retry the scan including singles rather than
       * reporting "no albums available". Only when the user chose nothing —
       * an explicit album pick means exactly those albums. */
      if (!albums.length && !chosen.length && !includeSingles) {
        return scanAlbums("album,single,compilation", R.MAX_ALBUM_PAGES);
      }
      return albums;
    }).then(function (albums) {
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
      var pool = albums;
      if (!chosen.length && !R.INCLUDE_SINGLES) {
        /* Prefer full releases: a single's track lookup yields one or two songs
         * where an album yields ten or more, so spending the lookup budget on
         * albums is what makes the scan fast enough to be worth it. */
        var full = albums.filter(function (album) {
          return !isSingleRelease(album);
        });
        if (full.length) pool = full;
      }

      var picks;
      if (chosen.length) {
        picks = pool.slice();
      } else {
        shuffleInPlace(pool);
        picks = pool.slice(0, R.MAX_ALBUM_FETCHES);
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
            var credit = creditInfo(t, artist);
            /* Album tracks carry a real artist credit, so a track that neither
             * names this artist nor lists them as a feature belongs to someone
             * else. */
            if (!credit.primary && !credit.featured) return;
            if (!opts.includeFeatured && credit.featured) return;
            if (!matchesContentRating(t, opts.explicitMode)) return;
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
      setBuildStatus("The song catalogue service isn't reachable.");
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
      state.selected.forEach(function (a) {
        (a.songs || []).forEach(function (s) {
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
    stopDraw();
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
    if (isLeague() && cur.phase === "playoff") {
      var tie = cur.tie;
      return (
        tie.groupName +
        " tie-breaker · " +
        (cur.index + 1) +
        " of " +
        tie.rounds[cur.round].length
      );
    }
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
       * missed the qualifying places. A contested line is not complete: its
       * songs are still playing for those places. */
      var groupDone =
        l.groupRounds.length > 0 &&
        l.groupRounds.every(function (round) {
          return round.every(function (m) {
            return !(m.a && m.b) || m.winner !== undefined;
          });
        }) &&
        l.ties.length === 0;

      l.groups.forEach(function (grp) {
        grp.table.forEach(function (row, idx) {
          if (groupDone) {
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

  /* ── Group tie-breaker UI ───────────────────────────────────────────────── */
  /* Rendered after the last group match when the table cannot separate songs
   * that straddle a qualification line. The knockout is not seeded until the
   * player settles every contested line, one group at a time. */
  function renderTieBreaker() {
    var l = state.league;
    var tie = l.activeTie;

    if (!tie) {
      els.tiePanel.hidden = true;
      return;
    }

    els.tiePanel.hidden = false;
    els.tieTitle.textContent =
      tie.groupName + " — " + tie.slots + " place" +
      (tie.slots === 1 ? "" : "s") + " for " + tie.tier.length + " songs";

    if (tie.mode === "playoff") {
      renderTiePlayoff(tie);
      return;
    }

    els.tieText.textContent =
      "Level on " + tie.points + " points across the qualification line, with " +
      "identical records. Choose how to settle it.";
    els.tieBody.innerHTML = "";
    els.tieModes.hidden = false;
    renderTieModeDescriptions(tie);
    /* More than one line may be contested; the count is worth showing so the
     * player knows the group stage is not finished after this one. */
    if (l.ties.length > 1) {
      els.tieText.textContent +=
        " " + (l.ties.length - 1) + " more group" +
        (l.ties.length - 1 === 1 ? " is" : "s are") + " still to settle.";
    }
  }

  /* Spell out what each of the three ways of settling a level group will do,
   * using this tie's real numbers so the choice is never a guess. */
  function renderTieModeDescriptions(tie) {
    var plan = window.STLeague.planTieRound(tie.tier.length, tie.slots);
    var matches = plan.twos + plan.threes;
    var shape = [];
    if (plan.threes) {
      shape.push(plan.threes + " three-way" + (plan.threes === 1 ? "" : "s"));
    }
    if (plan.twos) {
      shape.push(plan.twos + " head-to-head" + (plan.twos === 1 ? "" : "s"));
    }
    if (plan.byes) {
      shape.push(plan.byes + " bye" + (plan.byes === 1 ? "" : "s"));
    }

    els.tieManualDesc.textContent =
      "You choose which " + tie.slots + " of the " + tie.tier.length +
      " songs go through, in the order you want them seeded. Nothing is played.";
    els.tieRandomDesc.textContent =
      "The " + tie.slots + " qualifying places are drawn at random from the " +
      tie.tier.length + " tied songs. Nothing is played.";
    els.tiePlayoffDesc.textContent =
      "The tied songs play " + matches + " extra match" +
      (matches === 1 ? "" : "es") + " (" + shape.join(", ") + ") until " +
      tie.slots + " are left. Each win is worth 3 points and the table updates " +
      "after every match.";
  }

  function renderTiePlayoff(tie) {
    els.tieModes.hidden = true;
    els.tieBody.innerHTML = "";

    var round = tie.rounds[tie.rounds.length - 1] || [];
    var pending = round.filter(function (m) {
      return m.winner === undefined;
    });
    var threes = round.filter(function (m) {
      return !!m.c;
    }).length;

    var note = document.createElement("p");
    note.className = "hint";
    note.textContent =
      pending.length + " playoff match" + (pending.length === 1 ? "" : "es") +
      " left in this round" + (threes ? " (" + threes + " three-way)" : "") + ".";
    els.tieBody.appendChild(note);

    var grid = document.createElement("div");
    grid.className = "tie-matches";

    round.forEach(function (m, index) {
      var box = document.createElement("div");
      box.className = "tie-match";

      var head = document.createElement("div");
      head.className = "tie-match-head";
      head.textContent = m.c
        ? "Three-way · " + (tie.slots + index)
        : "Head-to-head";
      box.appendChild(head);

      var songs = [m.a, m.b, m.c].filter(Boolean);
      songs.forEach(function (song) {
        var row = document.createElement("button");
        row.type = "button";
        row.className = "tie-song";
        row.disabled = m.winner !== undefined;

        row.appendChild(tieSongArt(song));
        var text = document.createElement("span");
        text.className = "tie-song-text";
        var strong = document.createElement("strong");
        strong.textContent = song.name;
        text.appendChild(strong);
        var span = document.createElement("span");
        span.textContent = song.artistName;
        text.appendChild(span);
        row.appendChild(text);

        if (m.winner === song) row.classList.add("won");
        else if (m.winner !== undefined) row.classList.add("lost");

        row.addEventListener("click", function () {
          var side = m.a === song ? "a" : m.b === song ? "b" : "c";
          l.pick(m, side);
          renderTournament();
        });
        box.appendChild(row);
      });

      grid.appendChild(box);
    });

    els.tieBody.appendChild(grid);
  }

  /* Album cover for a tie-break song bubble, falling back to a lettered tile. */
  function tieSongArt(song) {
    var art = avatarEl(song.image, song.name);
    art.classList.add("tie-art");
    return art;
  }

  /* Manual mode: tick songs in the order they should qualify. Clicking a song
   * appends it, so the order of clicks IS the final order. */
  function renderTieManual(tie) {
    els.tieModes.hidden = true;
    els.tieBody.innerHTML = "";

    var picked = [];

    var note = document.createElement("p");
    note.className = "hint tie-note";
    note.textContent =
      "Click " + tie.slots + " songs to send through, in the order you want them " +
      "seeded. A song can be clicked again to remove it.";
    els.tieBody.appendChild(note);

    var confirm = document.createElement("button");
    confirm.className = "btn btn-primary btn-sm tie-confirm";
    confirm.textContent = "Confirm qualifiers";
    confirm.disabled = true;

    var list = document.createElement("div");
    list.className = "tie-songs";

    tie.tier.forEach(function (row) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tie-song";

      btn.appendChild(tieSongArt(row.song));
      var text = document.createElement("span");
      text.className = "tie-song-text";
      var strong = document.createElement("strong");
      strong.textContent = row.song.name;
      text.appendChild(strong);
      var span = document.createElement("span");
      span.textContent = row.song.artistName;
      text.appendChild(span);
      btn.appendChild(text);

      btn.addEventListener("click", function () {
        var at = picked.indexOf(row.song.key);
        if (at >= 0) picked.splice(at, 1);
        else if (picked.length < tie.slots) picked.push(row.song.key);
        else return;

        Array.prototype.forEach.call(list.children, function (child, i) {
          var order = picked.indexOf(tie.tier[i].song.key);
          child.classList.toggle("won", order >= 0);
          var badge = child.querySelector(".tie-order");
          if (badge) {
            badge.textContent = order >= 0 ? order + 1 : "";
          }
        });
        confirm.disabled = picked.length !== tie.slots;
      });

      var badge = document.createElement("span");
      badge.className = "tie-order";
      btn.appendChild(badge);

      list.appendChild(btn);
    });

    els.tieBody.appendChild(list);
    els.tieBody.appendChild(confirm);

    /* A way back to the three options without committing a pick. */
    var back = document.createElement("button");
    back.type = "button";
    back.className = "btn btn-ghost btn-sm tie-back";
    back.textContent = "← Back to options";
    back.addEventListener("click", function () {
      renderTieBreaker();
    });
    els.tieBody.appendChild(back);

    confirm.addEventListener("click", function () {
      /* Chosen songs take the qualifying places; the rest keep the table's
       * existing order below them. */
      var rest = tie.tier
        .map(function (row) {
          return row.song.key;
        })
        .filter(function (key) {
          return picked.indexOf(key) === -1;
        });
      state.league.settleTie(tie.groupIndex, picked.concat(rest));
      renderTournament();
    });
  }

  els.tieManualBtn.addEventListener("click", function () {
    if (state.league && state.league.activeTie) renderTieManual(state.league.activeTie);
  });

  /* ── Random draw ────────────────────────────────────────────────────────── */
  /* The draw is decided up front (so the result is a genuine random order) and
   * then revealed one ball at a time, bingo style. The table is only updated
   * once the last ball is out, so the reveal is what the player watches. */
  var drawTimer = null;

  function stopDraw() {
    if (drawTimer) {
      clearTimeout(drawTimer);
      drawTimer = null;
    }
  }

  function renderTieDraw(tie, order) {
    els.tieModes.hidden = true;
    els.tieBody.innerHTML = "";

    var note = document.createElement("p");
    note.className = "hint tie-note";
    note.textContent =
      "Drawing " + tie.slots + " qualifying place" +
      (tie.slots === 1 ? "" : "s") + " from " + tie.tier.length + " songs…";
    els.tieBody.appendChild(note);

    var machine = document.createElement("div");
    machine.className = "draw-machine";

    var drum = document.createElement("div");
    drum.className = "draw-drum";
    var ball = document.createElement("div");
    ball.className = "draw-ball";
    ball.textContent = "?";
    drum.appendChild(ball);
    machine.appendChild(drum);

    var out = document.createElement("div");
    out.className = "draw-out";
    machine.appendChild(out);

    els.tieBody.appendChild(machine);

    var byKey = {};
    tie.tier.forEach(function (row) {
      byKey[row.song.key] = row.song;
    });

    var revealed = 0;
    var total = tie.slots;

    function revealNext() {
      if (revealed >= total) {
        note.textContent = "Draw complete — the table has been updated.";
        drum.classList.remove("spinning");
        ball.classList.add("settled");
        drawTimer = setTimeout(function () {
          drawTimer = null;
          state.league.settleTie(tie.groupIndex, order);
          renderTournament();
        }, 900);
        return;
      }

      var song = byKey[order[revealed]];
      revealed++;

      /* Spin for a moment, then pop the ball out of the drum. */
      drum.classList.add("spinning");
      ball.textContent = "?";
      drawTimer = setTimeout(function () {
        drum.classList.remove("spinning");
        ball.textContent = revealed;
        ball.classList.remove("pop");
        /* Force a reflow so the pop animation restarts for every ball. */
        void ball.offsetWidth;
        ball.classList.add("pop");

        var chip = document.createElement("div");
        chip.className = "draw-chip";
        chip.appendChild(tieSongArt(song));
        var text = document.createElement("span");
        text.className = "draw-chip-text";
        var strong = document.createElement("strong");
        strong.textContent = song.name;
        text.appendChild(strong);
        var span = document.createElement("span");
        span.textContent = song.artistName;
        text.appendChild(span);
        chip.appendChild(text);
        var place = document.createElement("em");
        place.className = "draw-place";
        place.textContent = "#" + revealed;
        chip.appendChild(place);
        out.appendChild(chip);

        drawTimer = setTimeout(revealNext, 700);
      }, 650);
    }

    revealNext();
  }

  els.tieRandomBtn.addEventListener("click", function () {
    if (!state.league || !state.league.activeTie) return;
    var tie = state.league.activeTie;
    stopDraw();

    /* Same shuffle the league uses, so the drawn order is the settled order. */
    var order = window.STLeague.shuffle(
      tie.tier.map(function (row) {
        return row.song.key;
      }),
    );
    renderTieDraw(tie, order);
  });

  els.tiePlayoffBtn.addEventListener("click", function () {
    if (state.league && state.league.activeTie) {
      stopDraw();
      state.league.startTiePlayoff(state.league.activeTie.groupIndex);
      renderTournament();
    }
  });

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
      /* A league whose group stage is done can still be waiting on a contested
       * qualification line; that is not the end of the tournament. */
      if (isLeague() && state.league.activeTie) {
        els.roundLabel.textContent = "Group tie-breaker";
        els.matchup.innerHTML = "";
        els.tiePanel.hidden = false;
        renderTieBreaker();
        renderBracketView(null);
        return;
      }
      showChampion();
      return;
    }

    els.roundLabel.textContent = roundLabelFor(cur);
    /* The tie panel only shows when there is no match to play; a live playoff
     * round is a normal matchup with (possibly) three songs. */
    if (isLeague() && cur.phase !== "playoff") renderTieBreaker();
    else els.tiePanel.hidden = true;

    renderMatchup(cur, status);
    renderBracketView(
      isLeague() && cur.phase === "knockout" ? cur.match : null,
    );
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

    /* Playoff matches belong to the group stage for progress purposes — they
     * are how the group stage finishes. */
    l.ties.forEach(function (tie) {
      (tie.rounds || []).forEach(function (round) {
        round.forEach(function (m) {
          groupTotal++;
          if (m.winner !== undefined) groupPlayed++;
        });
      });
    });

    els.stageProgress.hidden = false;
    var groupDone =
      groupTotal > 0 && groupPlayed >= groupTotal && l.ties.length === 0;
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
    /* Release date and genres live in the same chip row as the featured/album
     * tags, which is where the reference layout puts them. */
    var released =
      window.STPlayer && window.STPlayer.formatReleaseDate
        ? window.STPlayer.formatReleaseDate(song.releaseDate)
        : "";
    if (released) tags.appendChild(tag(released));
    (song.genres || []).slice(0, 2).forEach(function (genre) {
      tags.appendChild(tag(genre));
    });
    var st = status[song.key];
    if (st === "eliminated") tags.appendChild(tag("Eliminated"));
    else if (st === "qualified") tags.appendChild(tag("Qualified"));
    card.appendChild(tags);

    var embed = document.createElement("div");
    embed.className = "embed-slot";
    renderPlayer(
      embed,
      {
        title: song.name,
        previewUrl: song.previewUrl,
        chipsOnCard: true,
        image: song.image,
        artistName: song.artistName,
        isExplicit: song.isExplicit,
        bgColor: song.bgColor,
        releaseDate: song.releaseDate,
        genres: song.genres,
        durationMs: song.durationMs,
        trackUrl: song.trackUrl,
      },
      152,
    );
    card.appendChild(embed);

    /* Open-in-Apple-Music link, below the player so it can't obscure it. */
    var meta = document.createElement("div");
    meta.className = "player-meta";

    var open = document.createElement("a");
    open.className = "open-in-apple";
    open.href = song.trackUrl || "https://music.apple.com/";
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "Open in Apple Music ↗";
    meta.appendChild(open);
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
     * keep up to 3 old players running (and audible) behind the new cards. */
    if (window.STPlayer) window.STPlayer.clear();

    els.matchup.innerHTML = "";
    els.matchup.classList.remove("three-way");

    /* A playoff three-way is a normal head-to-head with one extra card; the
     * third song's pick is recorded as side "c". */
    if (cur.match.c) {
      els.matchup.classList.add("three-way");
      els.matchup.appendChild(buildSongCard(cur.match.a, "a", cur, status));
      var vsA = document.createElement("div");
      vsA.className = "vs-badge";
      vsA.textContent = "VS";
      els.matchup.appendChild(vsA);
      els.matchup.appendChild(buildSongCard(cur.match.b, "b", cur, status));
      var vsB = document.createElement("div");
      vsB.className = "vs-badge";
      vsB.textContent = "VS";
      els.matchup.appendChild(vsB);
      els.matchup.appendChild(buildSongCard(cur.match.c, "c", cur, status));
      return;
    }

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
      if (roundIndex === 0 && match.winner !== undefined)
        div.textContent = "Bye";
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

    state.league.groups.forEach(function (grp, grpIndex) {
      var box = document.createElement("div");
      box.className = "standings";

      var h = document.createElement("h3");
      h.textContent = grp.name;
      box.appendChild(h);

      var note = document.createElement("p");
      note.className = "qualify-note";
      note.textContent = "Top " + state.league.qualify + " qualify";
      /* Flag a contested line right on the table so the reason for the
       * tie-breaker is visible where the songs are listed. */
      var contested = state.league.ties.some(function (tie) {
        return tie.groupIndex === grpIndex;
      });
      if (contested) {
        note.textContent += " · level on points, to be settled";
        note.classList.add("contested");
      }
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
    stopDraw();
    var ok = isLeague() ? state.league.undo() : state.tournament.undo();
    if (ok) {
      showScreen("tournament");
      renderTournament();
    }
  });

  function backToSetup() {
    stopDraw();
    state.tournament = null;
    state.league = null;
    setBuildStatus("");
    showScreen("setup");
  }

  els.resetBtn.addEventListener("click", backToSetup);

  /* ── Champion ───────────────────────────────────────────────────────────── */
  function showChampion() {
    var champ = isLeague()
      ? state.league.champion()
      : state.tournament.champion();
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
    showScreen("champion");
    renderPlayer(
      els.championEmbed,
      {
        title: champ.name,
        previewUrl: champ.previewUrl,
        image: champ.image,
        artistName: champ.artistName,
        isExplicit: champ.isExplicit,
        bgColor: champ.bgColor,
        releaseDate: champ.releaseDate,
        genres: champ.genres,
        durationMs: champ.durationMs,
        trackUrl: champ.trackUrl,
      },
      232,
    );

    els.podiumList.innerHTML = "";
    addPodium(1, champ, "Champion");
    if (runnerUp) addPodium(2, runnerUp, "Runner-up");
    thirds.forEach(function (song) {
      addPodium(3, song, "Joint third");
    });

    renderPodiumStage(champ, runnerUp, thirds);
  }

  /* The visual podium: 2nd, 1st, then every joint-third, left to right. Each is
   * a pillar whose height encodes the placing, with the album cover floating
   * above it. Built as plain divs — the 3D feel is pure CSS (perspective,
   * rotateX, layered shadows). */
  function renderPodiumStage(champ, runnerUp, thirds) {
    els.podiumStage.innerHTML = "";
    if (!champ) return;

    /* A bracket has two semi-final losers, so there can be two joint-thirds.
     * Both get their own column rather than one column listing the other. */
    var order = [
      { place: 2, song: runnerUp, label: "2nd" },
      { place: 1, song: champ, label: "1st" },
    ];
    (thirds || []).forEach(function (song) {
      order.push({ place: 3, song: song, label: "3rd" });
    });

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
    refreshFormatUI();
    /* Confirm the catalogue service answers before the user starts typing, so a
     * misconfigured proxy is reported immediately rather than after a search. */
    refreshConnectionUI();
    probeProxy();
  }

  boot();
})();
