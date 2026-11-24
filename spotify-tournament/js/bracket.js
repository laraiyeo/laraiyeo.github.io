/* ─── Single-elimination bracket engine ─────────────────────────────────────
 * Handles the awkward case of "not a power of two" (10 artists x 10 songs =
 * up to 100 entries) by padding to the next power of two and giving the top
 * seeds first-round byes, spread using standard bracket seeding so the best
 * songs can't meet until late.
 *
 *   var t = new STBracket.Tournament(tracks, { shuffleSeeds: true });
 *   t.current()      → { round, index, match } | null
 *   t.pick(round, index, "a" | "b")
 *   t.undo()         → true when something was reverted
 *   t.champion()     → track | null
 *   t.playableCount()/t.playedCount()
 *   t.rounds         → [[ {a,b,winner} ]]   (a/b/winner: track | null | undefined)
 *
 * `undefined` means "not decided yet", `null` means "no song can ever be here"
 * (a bye or a dead branch).
 * ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  "use strict";

  function nextPowerOfTwo(n) {
    var p = 1;
    while (p < n) p *= 2;
    return p;
  }

  /* Standard bracket seeding. size 8 → [1,8,4,5,2,7,3,6] */
  function seedOrder(size) {
    var order = [1, 2];
    while (order.length < size) {
      var sum = order.length * 2 + 1;
      var next = [];
      for (var i = 0; i < order.length; i++) {
        next.push(order[i]);
        next.push(sum - order[i]);
      }
      order = next;
    }
    return order;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function buildRounds(tracks, options) {
    options = options || {};
    var list = options.shuffleSeeds ? shuffle(tracks.slice()) : tracks.slice();
    var n = list.length;
    if (n < 2) throw new Error("A tournament needs at least 2 songs.");

    var size = nextPowerOfTwo(n);
    var order = seedOrder(size);

    /* Seed 1..n map to tracks in order; anything above n is a bye (null). */
    var positions = order.map(function (seed) {
      return seed <= n ? list[seed - 1] : null;
    });

    var rounds = [];
    var first = [];
    for (var i = 0; i < positions.length; i += 2) {
      first.push({ a: positions[i], b: positions[i + 1], winner: undefined });
    }
    rounds.push(first);

    var remaining = first.length;
    while (remaining > 1) {
      remaining = remaining / 2;
      var round = [];
      for (var j = 0; j < remaining; j++) {
        round.push({ a: undefined, b: undefined, winner: undefined });
      }
      rounds.push(round);
    }
    return rounds;
  }

  function Tournament(tracks, options) {
    this.tracks = (tracks || []).slice();
    this.rounds = buildRounds(this.tracks, options || {});
    this.history = [];
    this.resolve();
  }

  /* Settle every match that can be decided without a human. Round 0 slots are
   * known immediately, so this cascades byes all the way down the bracket. */
  Tournament.prototype.resolve = function () {
    var changed = true;
    while (changed) {
      changed = false;
      for (var r = 0; r < this.rounds.length; r++) {
        var round = this.rounds[r];
        for (var i = 0; i < round.length; i++) {
          var m = round[i];
          if (m.winner !== undefined) continue;
          if (m.a === undefined || m.b === undefined) continue;
          if (m.a && m.b) continue; // a real match — needs the user
          m.winner = m.a || m.b || null;
          this.propagate(r, i, m.winner);
          changed = true;
        }
      }
    }
  };

  Tournament.prototype.propagate = function (r, i, winner) {
    if (r + 1 >= this.rounds.length) return;
    var next = this.rounds[r + 1][Math.floor(i / 2)];
    if (i % 2 === 0) next.a = winner;
    else next.b = winner;
  };

  Tournament.prototype.current = function () {
    for (var r = 0; r < this.rounds.length; r++) {
      var round = this.rounds[r];
      for (var i = 0; i < round.length; i++) {
        var m = round[i];
        if (m.a && m.b && m.winner === undefined) {
          return { round: r, index: i, match: m };
        }
      }
    }
    return null;
  };

  /* Snapshotting the whole bracket per pick makes undo trivial and exact. */
  Tournament.prototype.snapshot = function () {
    return this.rounds.map(function (round) {
      return round.map(function (m) {
        return { a: m.a, b: m.b, winner: m.winner };
      });
    });
  };

  Tournament.prototype.pick = function (r, i, side) {
    var m = this.rounds[r] && this.rounds[r][i];
    if (!m || !m.a || !m.b || m.winner !== undefined) return false;
    this.history.push(this.snapshot());
    m.winner = side === "a" ? m.a : m.b;
    this.propagate(r, i, m.winner);
    this.resolve();
    return true;
  };

  Tournament.prototype.undo = function () {
    if (!this.history.length) return false;
    this.rounds = this.history.pop();
    return true;
  };

  Tournament.prototype.canUndo = function () {
    return this.history.length > 0;
  };

  /* Every participant except the champion loses exactly one match. */
  Tournament.prototype.playableCount = function () {
    return Math.max(0, this.tracks.length - 1);
  };

  Tournament.prototype.playedCount = function () {
    var c = 0;
    this.rounds.forEach(function (round) {
      round.forEach(function (m) {
        if (m.a && m.b && m.winner !== undefined) c++;
      });
    });
    return c;
  };

  Tournament.prototype.champion = function () {
    var last = this.rounds[this.rounds.length - 1];
    if (!last || !last.length) return null;
    var m = last[0];
    return m.winner === undefined ? null : m.winner;
  };

  Tournament.prototype.isComplete = function () {
    return this.champion() !== null && this.current() === null;
  };

  global.STBracket = {
    Tournament: Tournament,
    shuffle: shuffle,
    nextPowerOfTwo: nextPowerOfTwo,
  };
})(window);
