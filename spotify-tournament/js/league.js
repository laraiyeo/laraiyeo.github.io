/* ─── League format (Champions League style) ────────────────────────────────
 * A two-phase tournament designed for exactly 8 artists x 4 songs = 32 songs.
 *
 * Phase 1 — GROUP STAGE (like the "league phase")
 *   The 32 songs are split into 2 groups of 16. Within a group, each song is
 *   drawn against 3 opponents — one song from each of the other 3 artists in
 *   that group. So every song plays 3 matches, each against a different artist,
 *   and the schedule is built so no match is repeated. Wins score 3 points (no
 *   draws are possible), and the group table is sorted on points, then wins,
 *   then fewest losses.
 *
 * Phase 2 — KNOCKOUT
 *   The top 4 from each group (8 songs) seed a standard bracket:
 *   Quarter-finals -> Semi-finals -> Final. Seeds are crossed so a group's #1
 *   meets the other group's #4, #2 meets #3, and so on.
 *
 * Total rounds = 1 group stage + QF + SF + Final = 4, as requested.
 *
 *   var lg = new STLeague.League(songs, { shuffle: true });
 *   lg.current()          → { phase, index, match } | null
 *   lg.pick(phase, index, "a" | "b")
 *   lg.undo() / lg.canUndo()
 *   lg.groupRounds        → [ [ {a, b, winner} ] ]  (one array per draw)
 *   lg.groups             → [ { name, songs, table } ]
 *   lg.knockoutRounds     → [ [ {a, b, winner} ] ]
 *   lg.totalPlayable() / lg.playedCount()
 *   lg.champion()
 *
 * Matches use the same {a, b, winner} shape as STBracket, so the existing
 * matchup UI can render either format. `winner: undefined` = undecided,
 * `null` = cannot happen.
 * ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  "use strict";

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function isPowerOfTwo(n) {
    return n > 1 && (n & (n - 1)) === 0;
  }

  /* Round-robin pairing for one group. Each song plays one match per "shift",
   * against a song from a different artist.
   *
   * The shift loop deliberately runs over ALL artists (k = 1..n-1). That makes
   * the pairing a set of cyclic bijections, which is what guarantees every song
   * plays exactly the same number of matches. Capping the number of shifts looks
   * tempting (fewer matches) but breaks that symmetry, leaving some songs with
   * more group games than others — so length is controlled by how many songs each
   * artist contributes and how many artists sit in a group, not here. */
  function buildGroupPairs(groupSongs, groupArtists) {
    var byArtist = {};
    groupSongs.forEach(function (s) {
      (byArtist[s.artistId] = byArtist[s.artistId] || []).push(s);
    });

    var pairs = [];
    var seen = {};

    for (var r = 0; r < groupArtists.length - 1; r++) {
      for (var i = 0; i < groupSongs.length / groupArtists.length; i++) {
        var pool = byArtist[groupArtists[r]] || [];
        var song = pool[i];
        if (!song) continue;
        for (var k = 1; k < groupArtists.length; k++) {
          var otherId = groupArtists[(r + k) % groupArtists.length];
          var others = byArtist[otherId] || [];
          if (!others.length) continue;
          var opp = others[(i + k) % others.length];
          var key = [song.key, opp.key].sort().join("|");
          if (seen[key]) continue;
          seen[key] = true;
          pairs.push({ a: song, b: opp });
        }
      }
    }
    return pairs;
  }

  /* Distribute pairs into draws, never repeating a song twice within a draw. */
  function scheduleDraws(pairs) {
    var draws = [];
    var remaining = pairs.slice();
    while (remaining.length) {
      var used = {};
      var draw = [];
      var still = [];
      remaining.forEach(function (p) {
        if (!used[p.a.key] && !used[p.b.key]) {
          used[p.a.key] = true;
          used[p.b.key] = true;
          draw.push({ a: p.a, b: p.b, winner: undefined });
        } else {
          still.push(p);
        }
      });
      /* Safety: if a draw could not take anything, force one pair through so we
       * never spin forever. */
      if (!draw.length && still.length) {
        draw.push({ a: still[0].a, b: still[0].b, winner: undefined });
        still.splice(0, 1);
      }
      draws.push(draw);
      remaining = still;
    }
    return draws;
  }

  function makeTable(songs) {
    return songs.map(function (s) {
      return {
        song: s,
        played: 0,
        wins: 0,
        losses: 0,
        points: 0,
      };
    });
  }

  /* Match counts per knockout round, largest first. 8 qualifiers -> [4,2,1]
   * (QF, SF, Final); 16 -> [8,4,2,1] (R16, QF, SF, Final). */
  function knockoutSizes(qualifierCount) {
    var sizes = [];
    var n = qualifierCount;
    while (n >= 2) {
      sizes.push(n / 2);
      n = n / 2;
    }
    return sizes;
  }

  /* The group counts the UI offers. Restricting to this set matters: a generic
   * "largest divisor" search invents counts like 5 or 6, which the setup screen
   * has no option for, so the two would disagree about what was chosen. */
  var GROUP_CHOICES = [8, 4, 2];

  /* Largest offered group count this many artists can support, or 0 if none.
   * Every group needs at least 2 artists, because a song must be drawn against a
   * DIFFERENT artist's song — a one-artist group would have nothing to play.
   * And the split must be even, so an ODD or prime artist count supports no
   * grouping at all.
   *
   * Returning 0 (rather than 1) is deliberate: 1 would make
   * `artistCount % 1 === 0` look valid and let an ungroupable field be built as
   * a single giant "group". */
  function maxGroups(artistCount) {
    var n = parseInt(artistCount, 10) || 0;
    for (var i = 0; i < GROUP_CHOICES.length; i++) {
      var g = GROUP_CHOICES[i];
      if (n % g === 0 && n / g >= 2) return g;
    }
    return 0;
  }

  /* The requested group count if this artist count supports it, otherwise the
   * next smaller offered count, or 0 when nothing works. */
  function resolveGroupCount(want, artistCount) {
    var n = parseInt(artistCount, 10) || 0;
    var requested = parseInt(want, 10) || 2;
    /* Walk down the offered set from the request, so choosing 8 with 8 artists
     * lands on 4 rather than silently doing something odd. */
    for (var i = 0; i < GROUP_CHOICES.length; i++) {
      var g = GROUP_CHOICES[i];
      if (g > requested) continue;
      if (n % g === 0 && n / g >= 2) return g;
    }
    return 0;
  }

  /* How many songs each artist contributes, derived from how many artists there
   * are. A fixed 10 songs per artist makes a 32-artist field absurd (320 songs),
   * so the total is held roughly constant and the per-artist share scales down.
   * Always at least MIN so every artist still has something to play. */
  function songsPerArtist(artistCount, targetTotal, min, max) {
    var cfg = (global.STConfig && global.STConfig) || {};
    var total = targetTotal || 48;
    var floor = min || 2;
    var ceiling = max || 10;
    var n = Math.max(1, artistCount || 1);
    var per = Math.round(total / n);
    return Math.max(floor, Math.min(ceiling, per));
  }

  /* Group-stage length is a consequence of the field: each song plays
   * (artists per group - 1) matches. Kept next to songsPerArtist so the two
   * "keep it playable" levers are easy to find together. */
  var TARGET_MATCHES = 48;
  var TARGET_SONGS = 48;

  function League(songs, options) {
    options = options || {};
    var cfg = (global.STConfig && global.STConfig.LEAGUE) || {};
    var perArtist = cfg.SONGS_PER_ARTIST || 4;

    /* Count the artists from the songs we actually got rather than trusting a
     * constant — the setup screen lets the user choose how many to add. */
    var artistIdsSeen = {};
    songs.forEach(function (s) {
      artistIdsSeen[s.artistId] = true;
    });
    var artistCount = Object.keys(artistIdsSeen).length || cfg.ARTISTS || 8;

    /* How the songs are split into groups. `options.groups` comes from the setup
     * screen; it is clamped to what the artist count can support. The caller is
     * expected to have validated this already, but fall back to the largest
     * valid count rather than throwing if it somehow did not. */
    var groupCount = resolveGroupCount(options.groups || cfg.GROUPS, artistCount);
    if (!groupCount) {
      /* Ungroupable field (odd/prime artist count). Nothing sensible to build. */
      this.tracks = songs.slice();
      this.history = [];
      this.artistCount = artistCount;
      this.groupCount = 0;
      this.qualify = 0;
      this.songsPerGroup = 0;
      this.groups = [];
      this.groupRounds = [];
      this.knockoutRounds = [];
      this.empty = true;
      return;
    }

    this.tracks = songs.slice();
    this.history = [];
    this.artistCount = artistCount;
    this.groupCount = groupCount;

    /* Songs per group = (artists per group) x (songs per artist). */
    var songsPerGroup = (artistCount / groupCount) * perArtist;

    /* Qualifying places per group. Must leave a power-of-two bracket, because
     * the knockout is a normal single-elimination tree. 4 places is the default
     * and the most that is meaningful for a 16-song group. */
    var wanted = parseInt(options.qualify || cfg.QUALIFY_PER_GROUP, 10) || 4;
    var qualify = Math.max(2, Math.min(wanted, Math.pow(2, Math.floor(Math.log(songsPerGroup) / Math.LN2))));
    /* Total qualifiers must be a power of two, so trim the per-group count until
     * it is (e.g. 4 groups x 4 = 16 is fine; 4 groups x 3 = 12 is not). */
    while (qualify > 2 && !isPowerOfTwo(groupCount * qualify)) qualify--;
    this.qualify = qualify;
    this.songsPerGroup = songsPerGroup;

    /* Group the songs by artist, then assign artists to groups so each group
     * holds a spread of artists. */
    var byArtist = {};
    this.tracks.forEach(function (s) {
      (byArtist[s.artistId] = byArtist[s.artistId] || []).push(s);
    });
    var artistIds = Object.keys(byArtist);
    if (options.shuffle) shuffle(artistIds);

    var groupArtistIds = [];
    for (var g = 0; g < groupCount; g++) groupArtistIds.push([]);
    artistIds.forEach(function (id, i) {
      groupArtistIds[i % groupCount].push(id);
    });

    this.groups = groupArtistIds.map(function (ids, index) {
      var groupSongs = [];
      ids.forEach(function (id) {
        groupSongs = groupSongs.concat(byArtist[id] || []);
      });
      if (options.shuffle) shuffle(groupSongs);
      return {
        name: "Group " + String.fromCharCode(65 + index),
        songs: groupSongs,
        artistIds: ids,
        table: makeTable(groupSongs),
      };
    });

    /* Group-stage schedule. All groups play their draws side by side, so
     * "Draw 1" means draw 1 in EVERY group. */
    var perGroup = this.groups.map(function (grp) {
      return scheduleDraws(buildGroupPairs(grp.songs, grp.artistIds));
    });    var drawCount = perGroup.reduce(function (max, draws) {
      return Math.max(max, draws.length);
    }, 0);
    var groupRounds = [];
    for (var d = 0; d < drawCount; d++) {
      var round = [];
      perGroup.forEach(function (draws) {
        if (draws[d]) round = round.concat(draws[d]);
      });
      groupRounds.push(round);
    }
    this.groupRounds = groupRounds;

    /* Knockout placeholders, filled once the group stage resolves. Sized from
     * the number of qualifiers so it works for 8 (QF/SF/F) or 16 (R16/…). */
    this.knockoutRounds = knockoutSizes(groupCount * qualify).map(
      function (matchCount) {
        var round = [];
        for (var i = 0; i < matchCount; i++) {
          round.push({ a: undefined, b: undefined, winner: undefined });
        }
        return round;
      },
    );

    this.refresh();
  }

  League.prototype.matchArrays = function () {
    return this.groupRounds.concat(this.knockoutRounds);
  };

  /* Recompute tables from the recorded winners, then propagate qualifiers into
   * the knockout bracket. */
  League.prototype.refresh = function () {
    var self = this;

    this.groups.forEach(function (grp) {
      grp.table = makeTable(grp.songs);
      var rows = {};
      grp.table.forEach(function (row) {
        rows[row.song.key] = row;
      });
      self.groupRounds.forEach(function (round) {
        round.forEach(function (m) {
          if (m.winner === undefined || !m.a || !m.b) return;
          /* Only count matches between songs in this group. */
          if (!rows[m.a.key] || !rows[m.b.key]) return;
          var loser = m.winner === m.a ? m.b : m.a;
          var w = rows[m.winner.key];
          var l = rows[loser.key];
          w.played++;
          w.wins++;
          w.points += 3;
          l.played++;
          l.losses++;
        });
      });
      grp.table.sort(function (x, y) {
        if (y.points !== x.points) return y.points - x.points;
        if (y.wins !== x.wins) return y.wins - x.wins;
        if (x.losses !== y.losses) return x.losses - y.losses;
        return x.song.name.localeCompare(y.song.name);
      });
    });

    /* Qualifiers: top N from group A (seeds 1..N) and top N from group B.
     * The tables always have rows (there are songs in them), so "complete" must
     * mean every group match has actually been decided — otherwise we would seed
     * the knockout off an arbitrary alphabetical order before a ball is kicked. */
    var groupComplete = this.groupRounds.every(function (round) {
      return round.every(function (m) {
        return !(m.a && m.b) || m.winner !== undefined;
      });
    });
    if (!groupComplete) return;

    /* Seed the knockout by crossing the groups. Each tie takes one qualifier
     * from the "low" half of the groups and one from the "high" half, and
     * pairs a group's seed i against another group's seed (qualify-1-i). That
     * keeps the strongest seeds apart and means no two songs from the same
     * group meet in the first knockout round. */
    var half = Math.max(1, Math.ceil(this.groups.length / 2));
    var lowGroups = this.groups.slice(0, half);
    var highGroups = this.groups.slice(half).slice().reverse();
    if (!highGroups.length) highGroups = lowGroups.slice().reverse();

    var qf = this.knockoutRounds[0];
    var tie = 0;
    for (var li = 0; li < lowGroups.length; li++) {
      for (var q = 0; q < this.qualify; q++) {
        if (tie >= qf.length) break;
        var lowTable = lowGroups[li].table;
        var highTable = highGroups[li % highGroups.length].table;
        if (lowTable.length < this.qualify || highTable.length < this.qualify) return;
        var opener = lowTable[q].song;
        var closer = highTable[this.qualify - 1 - q].song;
        /* Alternate the home/away side so the bracket alternates too. */
        if ((li + q) % 2 === 0) {
          qf[tie].a = opener;
          qf[tie].b = closer;
        } else {
          qf[tie].a = closer;
          qf[tie].b = opener;
        }
        tie++;
      }
    }

    if (tie === 0) return;

    /* Settle any knockout byes / auto-advances without a human. */
    var changed = true;
    while (changed) {
      changed = false;
      for (var r = 0; r < this.knockoutRounds.length; r++) {
        var round = this.knockoutRounds[r];
        for (var k = 0; k < round.length; k++) {
          var m = round[k];
          if (m.winner !== undefined) continue;
          if (m.a === undefined || m.b === undefined) continue;
          if (m.a && m.b) continue;
          m.winner = m.a || m.b || null;
          this.propagateKnockout(r, k, m.winner);
          changed = true;
        }
      }
    }
  };

  League.prototype.propagateKnockout = function (r, i, winner) {
    if (r + 1 >= this.knockoutRounds.length) return;
    var next = this.knockoutRounds[r + 1][Math.floor(i / 2)];
    if (i % 2 === 0) next.a = winner;
    else next.b = winner;
  };

  League.prototype.current = function () {
    var draws = this.groupRounds;
    for (var r = 0; r < draws.length; r++) {
      for (var i = 0; i < draws[r].length; i++) {
        var m = draws[r][i];
        if (m.a && m.b && m.winner === undefined) {
          return { phase: "group", index: i, match: m, round: r };
        }
      }
    }
    for (var kr = 0; kr < this.knockoutRounds.length; kr++) {
      for (var ki = 0; ki < this.knockoutRounds[kr].length; ki++) {
        var km = this.knockoutRounds[kr][ki];
        if (km.a && km.b && km.winner === undefined) {
          return { phase: "knockout", round: kr, index: ki, match: km };
        }
      }
    }
    return null;
  };

  League.prototype.snapshot = function () {
    var grab = this.matchArrays();
    return grab.map(function (round) {
      return round.map(function (m) {
        return { a: m.a, b: m.b, winner: m.winner };
      });
    });
  };

  League.prototype.pick = function (match, side) {
    if (!match || !match.a || !match.b || match.winner !== undefined)
      return false;
    this.history.push(this.snapshot());
    match.winner = side === "a" ? match.a : match.b;

    /* If this was a knockout match, push the winner into the next round. */
    for (var r = 0; r < this.knockoutRounds.length; r++) {
      var i = this.knockoutRounds[r].indexOf(match);
      if (i >= 0) {
        this.propagateKnockout(r, i, match.winner);
        break;
      }
    }
    this.refresh();
    return true;
  };

  League.prototype.undo = function () {
    if (!this.history.length) return false;
    this.restore(this.history.pop());
    return true;
  };

  League.prototype.restore = function (snapshot) {
    var all = this.matchArrays();
    for (var r = 0; r < all.length; r++) {
      for (var i = 0; i < all[r].length; i++) {
        var s = snapshot[r][i];
        all[r][i].a = s.a;
        all[r][i].b = s.b;
        all[r][i].winner = s.winner;
      }
    }
    this.refresh();
  };

  League.prototype.canUndo = function () {
    return this.history.length > 0;
  };

  League.prototype.totalPlayable = function () {
    var total = 0;
    this.groupRounds.forEach(function (round) {
      round.forEach(function (m) {
        if (m.a && m.b) total++;
      });
    });
    this.knockoutRounds.forEach(function (round) {
      round.forEach(function (m) {
        if (m.a && m.b) total++;
      });
    });
    return total;
  };

  League.prototype.playedCount = function () {
    var c = 0;
    this.matchArrays().forEach(function (round) {
      round.forEach(function (m) {
        if (m.a && m.b && m.winner !== undefined) c++;
      });
    });
    return c;
  };

  League.prototype.champion = function () {
    var last = this.knockoutRounds[this.knockoutRounds.length - 1];
    if (!last || !last.length) return null;
    var m = last[0];
    return m.winner === undefined ? null : m.winner;
  };

  global.STLeague = {
    League: League,
    shuffle: shuffle,
    /* Shared with the setup screen so its wording matches the real behaviour. */
    maxGroups: maxGroups,
    resolveGroupCount: resolveGroupCount,
    songsPerArtist: songsPerArtist,
    knockoutSizes: knockoutSizes,
    isPowerOfTwo: isPowerOfTwo,
  };
})(window);
