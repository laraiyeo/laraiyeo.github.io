/* ─── League format (Champions League style) ────────────────────────────────
 * A two-phase tournament: a round-robin group stage, then a knockout.
 *
 * Phase 1 — GROUP STAGE
 *   The artists are split into 2, 4 or 8 groups (chosen on the setup screen),
 *   each holding the same number of artists. Within a group, every song is
 *   drawn against songs by the OTHER artists in that group — each song plays
 *   the same number of matches, all against different artists, and the schedule
 *   is built so no pairing repeats. Wins score 3 points (no draws are
 *   possible), and the group table is sorted on points, then wins, then fewest
 *   losses.
 *
 * Phase 1b — TIE-BREAKS
 *   Points can leave several songs level ACROSS a qualification line (four
 *   songs on 6 points for two places, say) with identical records. The table
 *   cannot separate them, so the tournament stops and asks how to settle it:
 *   pick manually, draw at random, or play it out (tied songs meet in 2-ways and,
 *   3-ways). The knockout is NOT seeded until every contested line is settled.
 *
 * Phase 2 — KNOCKOUT
 *   The top 4 from every group seed a single-elimination bracket, crossed so a
 *   group's #1 meets another group's #4, #2 meets #3, and so on. 4 groups x 4
 *   gives a Round of 16; 2 groups x 4 gives Quarter-finals -> Final.
 *
 *   var lg = new STLeague.League(songs, { shuffle: true, groups: 4 });
 *   lg.current()          → { phase, index, match } | null
 *   lg.pick(match, "a" | "b" | "c")
 *   lg.undo() / lg.canUndo()
 *   lg.groupRounds        → [ [ {a, b, winner} ] ]  (one array per draw)
 *   lg.groups             → [ { name, songs, table } ]
 *   lg.knockoutRounds     → [ [ {a, b, winner} ] ]
 *   lg.ties / lg.playoffs → contested qualification lines and their playoffs
 *   lg.settleTie(groupIndex, keys) / lg.settleTieRandomly(groupIndex)
 *   lg.startTiePlayoff(groupIndex)
 *   lg.totalPlayable() / lg.playedCount()
 *   lg.champion()
 *
 * Matches use the same {a, b, winner} shape as STBracket, so the existing
 * matchup UI can render either format. A playoff 3-way adds `c`. `winner:
 * undefined` = undecided, `null` = cannot happen.
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

  /* Minimum group matches per song. With a single match a 16-song group ends
   * with 8 songs on 3 points and 8 on 0, so half the field ties for the four
   * qualifying places and the table is settled by name. Two matches is the
   * smallest schedule that actually separates the field. */
  var MIN_GROUP_MATCHES = 2;
  /* Ceiling so a big group does not balloon: 8 artists in one group would
   * otherwise mean 7 matches per song. */
  var MAX_GROUP_MATCHES = 3;

  /* How many matches each song plays in a group of `artistCount` artists.
   * Mirrors the schedule built by buildGroupPairs, so the setup screen can
   * describe the real schedule instead of guessing at it. */
  function groupMatchesPerSong(artistCount) {
    var A = artistCount;
    if (A < 2) return 0;
    var target = Math.max(MIN_GROUP_MATCHES, Math.min(MAX_GROUP_MATCHES, A - 1));
    if (A % 2 === 0) {
      var rounds = Math.min(target, A - 1);
      return rounds * Math.max(1, Math.ceil(target / rounds));
    }
    /* Odd counts take every round with one artist sitting out each time, so a
     * song plays in A-1 of the A rounds. */
    return (A - 1) * Math.max(1, Math.round(target / (A - 1)));
  }

  /* One entry per round, each round a set of artist pairings in which every
   * artist appears at most once. Built with the circle method: an even artist
   * count gives a perfect matching every round, and an odd count is padded with
   * a dummy so each artist sits out exactly one round — which is what keeps the
   * match count uniform across the group. */
  function artistRounds(artistCount) {
    var A = artistCount;
    if (A < 2) return [];
    var n = A % 2 === 0 ? A : A + 1;
    var rounds = [];
    for (var r = 0; r < n - 1; r++) {
      var pairs = [];
      var fixed = n - 1;
      if (fixed < A && r < A) pairs.push([fixed, r]);
      for (var i = 1; i < n / 2; i++) {
        var x = (r + i) % (n - 1);
        var y = (r - i + (n - 1)) % (n - 1);
        if (x < A && y < A) pairs.push([x, y]);
      }
      rounds.push(pairs);
    }
    return rounds;
  }

  /* Round-robin pairing for one group. Every song plays exactly the same number
   * of matches, all against songs by other artists in the group.
   *
   * Uniformity is the whole point: the group table decides who qualifies, so a
   * song that played fewer games would be ranked on less evidence than its
   * rivals. It is achieved by pairing ARTISTS first — each artist meets the same
   * number of opponents — and then pairing their songs with a rotating offset,
   * so every song in the group plays `rounds x perPair` matches. */
  function buildGroupPairs(groupSongs, groupArtists) {
    var byArtist = {};
    groupSongs.forEach(function (s) {
      (byArtist[s.artistId] = byArtist[s.artistId] || []).push(s);
    });

    var A = groupArtists.length;
    if (A < 2) return [];

    /* Songs per artist is uniform — the caller trims every artist to the
     * shortest list — so a d-regular pairing between two artists is just an
     * offset rotation. */
    var P = Infinity;
    groupArtists.forEach(function (id) {
      P = Math.min(P, (byArtist[id] || []).length);
    });
    if (!isFinite(P) || P < 1) return [];

    var target = Math.max(
      MIN_GROUP_MATCHES,
      Math.min(MAX_GROUP_MATCHES, A - 1),
    );
    var rounds;
    var perPair;
    if (A % 2 === 0) {
      rounds = Math.min(target, A - 1);
      perPair = Math.max(1, Math.ceil(target / rounds));
    } else {
      /* Odd artist counts have no perfect matching, so every round is taken and
       * each artist sits out exactly once. */
      rounds = A;
      perPair = Math.max(1, Math.round(target / (A - 1)));
    }

    var pairs = [];
    artistRounds(A)
      .slice(0, rounds)
      .forEach(function (round) {
        round.forEach(function (pair) {
          var left = byArtist[groupArtists[pair[0]]] || [];
          var right = byArtist[groupArtists[pair[1]]] || [];
          for (var d = 0; d < perPair; d++) {
            for (var i = 0; i < P; i++) {
              var song = left[i];
              var opp = right[(i + d) % P];
              if (!song || !opp || song.key === opp.key) continue;
              pairs.push({ a: song, b: opp });
            }
          }
        });
      });
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
        /* Points from the group stage alone. Tie-break playoffs add to
         * `points` (so the table moves as they are played) but must not change
         * which songs are level, or the tie would dissolve mid-playoff. */
        groupPoints: 0,
        groupWins: 0,
        groupLosses: 0,
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
    var groupCount = resolveGroupCount(
      options.groups || cfg.GROUPS,
      artistCount,
    );
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
      this.initTieState();
      return;
    }

    this.tracks = songs.slice();
    this.history = [];
    this.artistCount = artistCount;
    this.groupCount = groupCount;
    this.initTieState();

    /* Group the songs by artist, then assign artists to groups so each group
     * holds a spread of artists. */
    var byArtist = {};
    this.tracks.forEach(function (s) {
      (byArtist[s.artistId] = byArtist[s.artistId] || []).push(s);
    });
    var artistIds = Object.keys(byArtist);

    /* Trim every artist to the shortest list. The schedule pairs songs by
     * position, so one artist contributing fewer songs would leave its whole
     * group short — a 16/16/16/15 split, where the odd group has a song sitting
     * out every round. The caller already refuses to build when an artist is
     * short, so this only guards against a partially-failed fetch. */
    var shortest = Infinity;
    artistIds.forEach(function (id) {
      shortest = Math.min(shortest, byArtist[id].length);
    });
    if (isFinite(shortest) && shortest > 0) {
      artistIds.forEach(function (id) {
        byArtist[id] = byArtist[id].slice(0, shortest);
      });
    }

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

    /* Songs per group, read from the real group contents so the qualify clamp
     * and the UI wording both match what is actually scheduled. */
    var songsPerGroup = this.groups.length
      ? this.groups[0].songs.length
      : (artistCount / groupCount) * perArtist;

    /* Qualifying places per group. Must leave a power-of-two bracket, because
     * the knockout is a normal single-elimination tree. 4 places is the default
     * and the most that is meaningful for a 16-song group. */
    var wanted = parseInt(options.qualify || cfg.QUALIFY_PER_GROUP, 10) || 4;
    var qualify = Math.max(
      2,
      Math.min(
        wanted,
        Math.pow(2, Math.floor(Math.log(songsPerGroup) / Math.LN2)),
      ),
    );
    /* Total qualifiers must be a power of two, so trim the per-group count until
     * it is (e.g. 4 groups x 4 = 16 is fine; 4 groups x 3 = 12 is not). */
    while (qualify > 2 && !isPowerOfTwo(groupCount * qualify)) qualify--;
    this.qualify = qualify;
    this.songsPerGroup = songsPerGroup;

    /* Group-stage schedule. All groups play their draws side by side, so
     * "Draw 1" means draw 1 in EVERY group. */
    var perGroup = this.groups.map(function (grp) {
      return scheduleDraws(buildGroupPairs(grp.songs, grp.artistIds));
    });
    var drawCount = perGroup.reduce(function (max, draws) {
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

    this.groups.forEach(function (grp, gi) {
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
          w.groupPoints += 3;
          w.groupWins++;
          l.played++;
          l.losses++;
          l.groupLosses++;
        });
      });

      /* Tie-break playoff matches are real matches too: a win is worth the same
       * 3 points, so the table moves as the playoff is played instead of only
       * jumping once the line is settled. */
      var playoff = self.playoffs[gi];
      if (playoff && playoff.rounds) {
        playoff.rounds.forEach(function (round) {
          round.forEach(function (m) {
            if (m.winner === undefined) return;
            [m.a, m.b, m.c].forEach(function (song) {
              if (!song || !rows[song.key]) return;
              var row = rows[song.key];
              row.played++;
              if (song === m.winner) {
                row.wins++;
                row.points += 3;
              } else {
                row.losses++;
              }
            });
          });
        });
      } else if (self.tieResults[gi]) {
        /* A playoff that has already finished: its results are re-applied from
         * where they were recorded. The table is rebuilt from scratch on every
         * refresh, so without this a later group's tie-break would wipe the
         * points earned in an earlier playoff. */
        var results = self.tieResults[gi];
        Object.keys(results).forEach(function (key) {
          var row = rows[key];
          if (!row) return;
          var earned = results[key];
          row.played += earned.wins + earned.losses;
          row.wins += earned.wins;
          row.losses += earned.losses;
          row.points += earned.wins * 3;
        });
      }

      grp.table.sort(compareRows);
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

    /* Work out which qualification lines are still contested. This also applies
     * any order already settled, which must be reflected in the tables before
     * the knockout is seeded. */
    this.updateTies(groupComplete);

    /* Re-sort now that settled tie ranks exist, so the seeded order matches the
     * order the player chose. */
    if (groupComplete) {
      this.groups.forEach(function (grp) {
        grp.table.sort(compareRows);
      });
    }

    if (!groupComplete) return;

    /* A contested qualification line must be settled first — the module will
     * not promote a song the table cannot justify. */
    if (this.ties.length) return;

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
        if (lowTable.length < this.qualify || highTable.length < this.qualify)
          return;
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
    /* A playoff for a contested group line comes first — the knockout cannot be
     * seeded until it is settled. */
    if (this.activeTie && this.activeTie.mode === "playoff") {
      for (var tr = 0; tr < this.activeTie.rounds.length; tr++) {
        var round = this.activeTie.rounds[tr];
        for (var ti = 0; ti < round.length; ti++) {
          if (round[ti].winner === undefined) {
            return {
              phase: "playoff",
              round: tr,
              index: ti,
              match: round[ti],
              tie: this.activeTie,
            };
          }
        }
      }
    }

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

  /* Snapshot covers both the match arrays and the tie-break state, so Undo
   * works across a playoff as well as across normal matches. */
  League.prototype.snapshot = function () {
    var grab = this.matchArrays();
    var rounds = grab.map(function (round) {
      return round.map(function (m) {
        return { a: m.a, b: m.b, winner: m.winner };
      });
    });

    var tieOrders = {};
    Object.keys(this.tieOrders).forEach(function (key) {
      if (this.tieOrders[key]) tieOrders[key] = this.tieOrders[key].slice();
    }, this);

    var playoffs = {};
    Object.keys(this.playoffs).forEach(function (key) {
      var tie = this.playoffs[key];
      playoffs[key] = {
        mode: tie.mode,
        survivors: (tie.survivors || []).slice(),
        eliminated: (tie.eliminated || []).slice(),
        byes: (tie.byes || []).slice(),
        rounds: (tie.rounds || []).map(function (round) {
          return round.map(function (m) {
            return { a: m.a, b: m.b, c: m.c, winner: m.winner };
          });
        }),
      };
    }, this);

    var tieResults = {};
    Object.keys(this.tieResults).forEach(function (key) {
      var group = this.tieResults[key];
      var copy = {};
      Object.keys(group).forEach(function (songKey) {
        copy[songKey] = {
          wins: group[songKey].wins,
          losses: group[songKey].losses,
        };
      });
      tieResults[key] = copy;
    }, this);

    return {
      rounds: rounds,
      tieOrders: tieOrders,
      playoffs: playoffs,
      tieResults: tieResults,
    };
  };

  League.prototype.pick = function (match, side) {
    if (!match || !match.a || !match.b || match.winner !== undefined)
      return false;
    this.history.push(this.snapshot());
    match.winner =
      side === "a" ? match.a : side === "b" ? match.b : side === "c" ? match.c : null;

    /* Playoff matches are their own phase; a 3-way is decided by the same
     * side-based pick, so "c" is handled by the caller naming the song. */
    if (this.activeTie && this.activeTie.rounds) {
      for (var t = 0; t < this.activeTie.rounds.length; t++) {
        if (this.activeTie.rounds[t].indexOf(match) >= 0) {
          this.progressTie(this.activeTie);
          this.refresh();
          return true;
        }
      }
    }

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

  /* ── Group tie-breaks ─────────────────────────────────────────────────────
   * Points alone decide who qualifies, but a group can finish with several
   * songs level on points ACROSS the qualification line — four songs on 6
   * points competing for two places, say. Their records are identical, so the
   * table cannot separate them and the tournament stops to ask how to settle
   * it:
   *
   *   "manual"  — the user picks who advances.
   *   "random"  — the qualifiers are drawn at random.
   *   "playoff" — the tied songs play it out. They are drawn into matches of
   *               two, and into a three-song match when the numbers do not
   *               pair up: 5 songs for 2 places is one 2-way and one 3-way.
   *
   * Until every contested line is settled the knockout is NOT seeded, so no
   * song can be promoted or dropped by an alphabetical accident.
   * ──────────────────────────────────────────────────────────────────────── */

  /* Matches needed to cut `n` survivors down to `s` qualifiers, as counts of
   * two-song matches, three-song matches and byes. A 3-way beats a bye because
   * it keeps a song's fate in its own hands, so byes are only used when there
   * is nothing left to play for (n <= 2s, i.e. only one or two eliminations). */
  function planTieRound(n, s) {
    if (n <= 2 * s) {
      var pairs = n - s;
      return { twos: pairs, threes: 0, byes: s - pairs };
    }
    var target = Math.max(s, Math.ceil(n / 3));
    return { twos: 3 * target - n, threes: n - 2 * target, byes: 0 };
  }

  League.prototype.initTieState = function () {
    /* groupIndex -> ordered song keys, best first. Present once settled. */
    this.tieOrders = {};
    /* groupIndex -> live playoff state, while one is being played out. */
    this.playoffs = {};
    /* groupIndex -> song key -> { wins, losses } earned in a SETTLED playoff.
     * The table is rebuilt from scratch on every refresh, so these results have
     * to be kept somewhere that outlives the playoff itself. */
    this.tieResults = {};
    this.ties = []; // contested lines still to settle
    this.activeTie = null;
  };

  /* The tier of songs sharing the points of the song ON the qualification
   * line, when that tier straddles the line. Null when the line is settled.
   *
   * Ranking here uses GROUP-STAGE points only. A tie-break playoff awards real
   * points (so the table moves as it is played), but those must not dissolve
   * the very tie the playoff exists to settle. */
  League.prototype.contestedTier = function (grp) {
    var qualify = this.qualify;
    var line = qualify - 1;
    if (line < 0 || line >= grp.table.length) return null;

    var ranked = grp.table.slice().sort(function (x, y) {
      if (y.groupPoints !== x.groupPoints) return y.groupPoints - x.groupPoints;
      if (y.groupWins !== x.groupWins) return y.groupWins - x.groupWins;
      if (x.groupLosses !== y.groupLosses) return x.groupLosses - y.groupLosses;
      return x.song.name.localeCompare(y.song.name);
    });

    var points = ranked[line].groupPoints;
    var tier = ranked.filter(function (row) {
      return row.groupPoints === points;
    });
    if (tier.length < 2) return null;

    var inside = tier.filter(function (row) {
      return ranked.indexOf(row) < qualify;
    });
    if (!inside.length || inside.length === tier.length) return null;

    return { tier: tier, slots: inside.length };
  };

  /* Re-derive which lines are contested and whether they have been settled.
   * `complete` means the group stage is finished: before that every song sits on
   * 0 points, so "level on points" would be meaningless — and an Undo out of a
   * finished stage must drop any tie-break decided there. */
  League.prototype.updateTies = function (complete) {
    var self = this;
    this.ties = [];
    this.activeTie = null;

    if (!complete) {
      this.tieOrders = {};
      this.playoffs = {};
      this.tieResults = {};
      return;
    }

    this.groups.forEach(function (grp, gi) {
      var contest = self.contestedTier(grp);
      if (!contest) {
        /* The line is no longer contested (Undo moved the points), so any
         * order or playoff recorded for it is meaningless. */
        delete self.tieOrders[gi];
        delete self.playoffs[gi];
        delete self.tieResults[gi];
        return;
      }

      var order = self.tieOrders[gi];
      if (order) {
        /* Record the settled order as a rank on each tied row; `refresh` sorts
         * the table once all ranks are known. */
        var rank = {};
        order.forEach(function (key, i) {
          rank[key] = i;
        });
        contest.tier.forEach(function (row) {
          row.tieRank = rank[row.song.key];
        });
        return;
      }

      var tie = self.playoffs[gi] || {
        groupIndex: gi,
        groupName: grp.name,
        tier: contest.tier,
        slots: contest.slots,
        points: contest.tier[0].points,
        mode: null,
        rounds: [],
        byes: [],
        survivors: [],
        eliminated: [],
      };
      tie.tier = contest.tier;
      tie.slots = contest.slots;
      tie.points = contest.tier[0].points;
      tie.groupName = grp.name;
      self.playoffs[gi] = tie;
      self.ties.push(tie);
    });

    /* The line the player must settle next, if any. A playoff that is already
     * under way always comes first: its matches are the ones the player is in
     * the middle of, and jumping to another group's unsettled line would
     * abandon it half-played — which is exactly what made a single pick look
     * like it skipped straight to the next group. */
    this.activeTie = null;
    for (var i = 0; i < this.ties.length; i++) {
      if (this.ties[i].mode === "playoff" && tieHasPending(this.ties[i])) {
        this.activeTie = this.ties[i];
        break;
      }
    }
    if (!this.activeTie) {
      for (var j = 0; j < this.ties.length; j++) {
        if (this.ties[j].mode !== "playoff") {
          this.activeTie = this.ties[j];
          break;
        }
      }
    }
    if (!this.activeTie) {
      /* No undecided line: resume the first playoff that still has matches. */
      for (var k = 0; k < this.ties.length; k++) {
        if (this.ties[k].mode === "playoff") {
          this.activeTie = this.ties[k];
          break;
        }
      }
    }
  };

  /* True while a playoff still has an undecided match in any of its rounds. */
  function tieHasPending(tie) {
    return (tie.rounds || []).some(function (round) {
      return round.some(function (m) {
        return m.winner === undefined;
      });
    });
  }

  function compareRows(x, y) {
    if (y.points !== x.points) return y.points - x.points;
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (x.losses !== y.losses) return x.losses - y.losses;
    var xr = x.tieRank === undefined ? Infinity : x.tieRank;
    var yr = y.tieRank === undefined ? Infinity : y.tieRank;
    if (xr !== yr) return xr - yr;
    return x.song.name.localeCompare(y.song.name);
  }

  /* Settle a contested line directly with an explicit order (manual pick or a
   * random draw). `keys` must be the tier's songs, best first.
   *
   * A playoff that was played out keeps its points: the table is a record of
   * the matches actually played, so the wins earned in the playoff stay on the
   * rows after the line is settled. */
  League.prototype.settleTie = function (groupIndex, keys) {
    var playoff = this.playoffs[groupIndex];
    var earned = {};
    if (playoff && playoff.rounds) {
      playoff.rounds.forEach(function (round) {
        round.forEach(function (m) {
          if (m.winner === undefined) return;
          [m.a, m.b, m.c].forEach(function (song) {
            if (!song) return;
            var entry = earned[song.key] || { wins: 0, losses: 0 };
            if (song === m.winner) entry.wins++;
            else entry.losses++;
            earned[song.key] = entry;
          });
        });
      });
    }

    /* Recorded before the refresh so the rebuilt tables pick the points up. */
    if (Object.keys(earned).length) {
      this.tieResults[groupIndex] = earned;
    }

    this.tieOrders[groupIndex] = keys.slice();
    delete this.playoffs[groupIndex];
    this.refresh();
  };

  /* Draw the qualifying places at random from the tied songs. */
  League.prototype.settleTieRandomly = function (groupIndex) {
    var tie = this.playoffs[groupIndex];
    if (!tie) return false;
    var pool = shuffle(
      tie.tier.map(function (row) {
        return row.song.key;
      }),
    );
    this.settleTie(groupIndex, pool);
    return true;
  };

  /* Start playing the contested line out. Three-song matches are rendered by
   * the matchup screen alongside the usual two-song ones, so a 3-way is played
   * exactly like a head-to-head with one extra choice. */
  League.prototype.startTiePlayoff = function (groupIndex) {
    var tie = this.playoffs[groupIndex];
    if (!tie) return false;

    tie.mode = "playoff";
    tie.survivors = shuffle(
      tie.tier.map(function (row) {
        return row.song;
      }),
    );
    tie.eliminated = [];
    tie.rounds = [];
    tie.byes = [];
    this.planTieMatches(tie);
    this.activeTie = tie;
    return true;
  };

  /* One round of playoff matches from the current survivors. */
  League.prototype.planTieMatches = function (tie) {
    var plan = planTieRound(tie.survivors.length, tie.slots);
    var pool = tie.survivors.slice();
    var round = [];

    function take(count) {
      return pool.splice(0, count);
    }

    for (var t = 0; t < plan.threes; t++) {
      var three = take(3);
      round.push({ a: three[0], b: three[1], c: three[2], winner: undefined });
    }
    for (var w = 0; w < plan.twos; w++) {
      var pair = take(2);
      round.push({ a: pair[0], b: pair[1], winner: undefined });
    }
    /* Leftover songs won the draw and sit this round out. */
    tie.byes = take(pool.length);
    tie.rounds.push(shuffle(round));
  };

  /* Called after a playoff match is decided. Once a round is complete the
   * winners either play another round or the line is settled. */
  League.prototype.progressTie = function (tie) {
    var last = tie.rounds[tie.rounds.length - 1];
    var pending = last.some(function (m) {
      return m.winner === undefined;
    });
    if (pending) return;

    var winners = last
      .map(function (m) {
        return m.winner;
      })
      .filter(Boolean)
      .concat(tie.byes || []);
    last.forEach(function (m) {
      [m.a, m.b, m.c].forEach(function (song) {
        if (song && winners.indexOf(song) === -1) tie.eliminated.push(song);
      });
    });

    if (winners.length > tie.slots) {
      tie.survivors = winners;
      tie.byes = [];
      this.planTieMatches(tie);
      return;
    }

    /* Settled: the winners take the qualifying places, then the songs knocked
     * out later rank above those knocked out earlier, so the final order is a
     * faithful record of how far each song got. */
    var order = winners.map(function (song) {
      return song.key;
    });
    var rest = tie.eliminated
      .slice()
      .reverse()
      .map(function (song) {
        return song.key;
      });
    this.settleTie(tie.groupIndex, order.concat(rest));
  };

  League.prototype.restore = function (snapshot) {
    var all = this.matchArrays();
    var rounds = snapshot.rounds || snapshot;
    for (var r = 0; r < all.length; r++) {
      for (var i = 0; i < all[r].length; i++) {
        var s = rounds[r][i];
        all[r][i].a = s.a;
        all[r][i].b = s.b;
        all[r][i].winner = s.winner;
      }
    }

    /* Restore tie-break state. A line that is still contested keeps whatever
     * was recorded for it: a settled order, or a part-played playoff whose
     * matches are copied back by song key. */
    this.tieOrders = {};
    this.playoffs = {};
    this.tieResults = {};
    this.ties = [];
    this.activeTie = null;

    var savedOrders = snapshot.tieOrders || {};
    Object.keys(savedOrders).forEach(function (key) {
      this.tieOrders[key] = savedOrders[key].slice();
    }, this);

    var savedResults = snapshot.tieResults || {};
    Object.keys(savedResults).forEach(function (key) {
      var group = savedResults[key];
      var copy = {};
      Object.keys(group).forEach(function (songKey) {
        copy[songKey] = {
          wins: group[songKey].wins,
          losses: group[songKey].losses,
        };
      });
      this.tieResults[key] = copy;
    }, this);

    var savedPlayoffs = snapshot.playoffs || {};
    var self = this;
    Object.keys(savedPlayoffs).forEach(function (key) {
      var saved = savedPlayoffs[key];
      var live = this.playoffs[key] || {};
      live.mode = saved.mode;
      live.survivors = (saved.survivors || []).slice();
      live.eliminated = (saved.eliminated || []).slice();
      live.byes = (saved.byes || []).slice();
      /* Match objects are rebuilt from the songs already in the tournament, so
       * a restored match is the same object the snapshot referred to. */
      live.rounds = (saved.rounds || []).map(function (round) {
        return round.map(function (m) {
          return { a: m.a, b: m.b, c: m.c, winner: m.winner };
        });
      });
      live.groupIndex = parseInt(key, 10);
      self.playoffs[key] = live;
    }, this);

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
    /* How many matches each song plays in a group of this many artists. */
    groupMatchesPerSong: groupMatchesPerSong,
    /* How a tie-break playoff splits `n` tied songs fighting for `s` places. */
    planTieRound: planTieRound,
  };
})(window);
