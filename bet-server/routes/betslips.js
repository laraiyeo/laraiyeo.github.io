const express = require("express");
const pool = require("../db/database");
const authMiddleware = require("../middleware/auth");
const axios = require("axios");
const { sendPushNotification, sendBetResultNotification } = require(
  "../services/pushNotifications"
);

const router = express.Router();

// In-memory watchers: { [betslipId]: { intervalId, lastStates: { pickKey: state }, events: [] } }
const betslipWatchers = {};

const ESPN_BASE_URL =
  process.env.ESPN_BASE_URL ||
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

function getPSTDateString(isoDate) {
  try {
    const d = new Date(isoDate);
    // Convert to PST by using UTC and offset -8
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const pst = new Date(utc + -8 * 3600000);
    return `${pst.getFullYear()}-${String(pst.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(pst.getDate()).padStart(2, "0")}`;
  } catch (e) {
    return null;
  }
}

/**
 * Start an in-memory watcher for a betslip ID.
 * Safe to call multiple times; will no-op if already watching.
 */
function startWatcher(betslipId) {
  if (betslipWatchers[betslipId]) return;

  // Last known states per pick
  const lastStates = {};

  const intervalId = setInterval(async () => {
    try {
      // Refresh betslip from DB
      const r = await pool.query("SELECT id, user_id, betslip_data, status FROM betslips WHERE id = $1", [betslipId]);
      if (r.rows.length === 0) {
        clearInterval(intervalId);
        delete betslipWatchers[betslipId];
        return;
      }

      const fresh = r.rows[0];
      const betsArr = (fresh.betslip_data && fresh.betslip_data.bets) || [];

      // Cache summaries per event for this tick
      const summaries = {};

      for (const evId of Array.from(new Set(betsArr.map((b) => b.gameId || b.game_id).filter(Boolean)))) {
        try {
          const resp = await axios.get(`${ESPN_BASE_URL}/summary?event=${evId}`);
          summaries[evId] = resp.data;
        } catch (e) {
          console.error('[Watcher] Failed to fetch summary for', evId, e.message || e);
        }
      }

      let anyChange = false;
      let allFinal = true;
      let anyLost = false;

      for (const bet of betsArr) {
        const pickKey = bet.id || JSON.stringify(bet);
        const evId = bet.gameId || bet.game_id;
        const summary = summaries[evId];

        let newState = null; // 'won' | 'lost' | 'in progress' | false

        if (!summary) {
          newState = 'in progress';
        } else {
          const gameStatus = summary.header?.competitions?.[0]?.status?.type;
          const isCompleted = gameStatus?.completed || false;

          // Moneyline heuristic
          if (!bet.playerId && !bet.player && !bet.prop && (bet.type === 'moneyline' || (!bet.line && (bet.team || bet.selection || bet.description)))) {
            const competitors = summary.header?.competitions?.[0]?.competitors || [];
            const betTeam = competitors.find((c) => c.team?.abbreviation === (bet.team || bet.selection || bet.description));
            const opp = competitors.find((c) => c.team?.abbreviation !== (bet.team || bet.selection || bet.description));
            if (betTeam && opp) {
              const betScore = parseInt(betTeam.score) || 0;
              const oppScore = parseInt(opp.score) || 0;
              const isWinning = betScore > oppScore;
              newState = isCompleted ? (isWinning ? 'won' : 'lost') : (isWinning ? 'in progress' : false);
            }
          }

          // Total points (over/under)
          if (newState === null && (bet.line || bet.betValue || bet.type === 'total' || bet.type === 'totalPoints')) {
            const competitors = summary.header?.competitions?.[0]?.competitors || [];
            const homeScore = parseInt(competitors.find((c) => c.homeAway === 'home')?.score) || 0;
            const awayScore = parseInt(competitors.find((c) => c.homeAway === 'away')?.score) || 0;
            const currentTotal = homeScore + awayScore;
            const raw = bet.line || bet.betValue || '';
            const isOver = String(raw).toLowerCase().startsWith('o');
            const lineNum = parseFloat(String(raw).replace(/[^0-9\.\-]/g, '')) || parseFloat(bet.line || bet.betValue || 0);
            const isWinning = isOver ? currentTotal > lineNum : currentTotal < lineNum;
            newState = isCompleted ? (isWinning ? 'won' : 'lost') : (isWinning ? 'in progress' : false);
          }

          // Spread
          if (newState === null && bet.line && bet.team) {
            const competitors = summary.header?.competitions?.[0]?.competitors || [];
            const betTeam = competitors.find((c) => c.team?.abbreviation === bet.team);
            const opp = competitors.find((c) => c.team?.abbreviation !== bet.team);
            if (betTeam && opp) {
              const betScore = parseInt(betTeam.score) || 0;
              const oppScore = parseInt(opp.score) || 0;
              const spreadLine = parseFloat(String(bet.line).replace(/[^0-9\.\-]/g, '')) || 0;
              const adjusted = betScore + spreadLine;
              const isWinning = adjusted > oppScore;
              newState = isCompleted ? (isWinning ? 'won' : 'lost') : (isWinning ? 'in progress' : false);
            }
          }

          // Player bets
          if (newState === null && (bet.playerId || bet.player)) {
            const players = summary.boxscore?.players || [];
            const playerObj = players.find((pTeam) => {
              const stats = pTeam.statistics && pTeam.statistics[0];
              const athletes = (stats && stats.athletes) || [];
              return athletes.find((a) => a.athlete?.id == (bet.playerId || bet.player));
            });

            if (playerObj) {
              const stats = playerObj.statistics && playerObj.statistics[0];
              const labels = (stats && stats.labels) || [];
              const athletes = (stats && stats.athletes) || [];
              const athlete = athletes.find((a) => a.athlete?.id == (bet.playerId || bet.player));
              if (athlete) {
                const raw = bet.prop || bet.betValue || '';
                if (String(raw).toLowerCase().startsWith('o') || String(raw).toLowerCase().startsWith('u')) {
                  const isOver = String(raw).toLowerCase().startsWith('o');
                  const lineNum = parseFloat(String(raw).replace(/[^0-9\.\-]/g, '')) || 0;
                  let current = 0;
                  if (bet.statType) {
                    const idx = labels.indexOf(String(bet.statType).toUpperCase());
                    current = idx >= 0 ? parseFloat(athlete.stats?.[idx]) || 0 : 0;
                  } else {
                    const firstVal = athlete.stats && athlete.stats.find((s) => !isNaN(parseFloat(s)));
                    current = firstVal ? parseFloat(firstVal) : 0;
                  }
                  const isWinning = isOver ? current > lineNum : current < lineNum;
                  newState = isCompleted ? (isWinning ? 'won' : 'lost') : (isWinning ? 'in progress' : false);
                }
              }
            }
          }

          if (newState === null) {
            newState = 'in progress';
          }
        }

        const prev = lastStates[pickKey];
        if (prev !== newState) {
          if (newState === 'won') {
            try {
              await sendPushNotification(fresh.user_id, 'Pick Won', `Your pick (${bet.description || bet.selection || bet.team || bet.player || 'pick'}) has won!`, { betslipId: fresh.id, pick: bet });
            } catch (e) {
              console.error('[Watcher] sendPushNotification error', e.message || e);
            }
          }

          if (newState === 'lost' && newState !== 'in progress') {
            try {
              await sendPushNotification(fresh.user_id, 'Pick Lost', `Your pick (${bet.description || bet.selection || bet.team || bet.player || 'pick'}) has been decided.`, { betslipId: fresh.id, pick: bet });
            } catch (e) {
              console.error('[Watcher] sendPushNotification error', e.message || e);
            }
          }

          lastStates[pickKey] = newState;
          anyChange = true;
        }

        if (newState === 'in progress') allFinal = false;
        if (newState === 'lost') anyLost = true;
      }

      if (allFinal) {
        const newStatus = anyLost ? 'lost' : 'won';
        if (fresh.status !== newStatus) {
          try {
            await pool.query('UPDATE betslips SET status = $1 WHERE id = $2', [newStatus, betslipId]);
            await sendBetResultNotification(betslipId);
          } catch (e) {
            console.error('[Watcher] Error updating betslip status', e.message || e);
          }
        }

        clearInterval(intervalId);
        delete betslipWatchers[betslipId];
      }
    } catch (tickErr) {
      console.error('[Watcher] interval error for', betslipId, tickErr.message || tickErr);
    }
  }, 5000);

  betslipWatchers[betslipId] = { intervalId, lastStates };
}

// Place a bet
router.post("/", authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { betslipData, totalStake, potentialPayout } = req.body;

    // Check if user has enough credits
    const userResult = await client.query(
      "SELECT credits FROM users WHERE id = $1",
      [req.userId]
    );

    const currentCredits = parseFloat(userResult.rows[0].credits);

    if (currentCredits < totalStake) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Insufficient credits" });
    }

    // Deduct credits
    const newCredits = currentCredits - totalStake;
    await client.query("UPDATE users SET credits = $1 WHERE id = $2", [
      newCredits,
      req.userId,
    ]);

    // Create betslip
    const betslipResult = await client.query(
      "INSERT INTO betslips (user_id, betslip_data, total_stake, potential_payout) VALUES ($1, $2, $3, $4) RETURNING id",
      [req.userId, JSON.stringify(betslipData), totalStake, potentialPayout]
    );

    const betslipId = betslipResult.rows[0].id;

    // Record in history
    await client.query(
      "INSERT INTO bet_history (user_id, betslip_id, action, credits_change, credits_after) VALUES ($1, $2, $3, $4, $5)",
      [req.userId, betslipId, "placed", -totalStake, newCredits]
    );

    await client.query("COMMIT");

    // Start watcher for this betslip asynchronously so notifications begin
    try {
      startWatcher(betslipId);
    } catch (e) {
      console.error('Error starting watcher after placement', e.message || e);
    }

    res.status(201).json({
      message: "Bet placed successfully",
      betslipId,
      creditsRemaining: newCredits,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Place bet error:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

// Get user betslips
router.get("/", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM betslips WHERE user_id = $1 ORDER BY created_at DESC",
      [req.userId]
    );

    res.json({ betslips: result.rows });
  } catch (error) {
    console.error("Get betslips error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get single betslip
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM betslips WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Betslip not found" });
    }

    res.json({ betslip: result.rows[0] });
  } catch (error) {
    console.error("Get betslip error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Start watching a betslip: begins a 5s poll evaluating picks and sending notifications
router.post("/:id/watch", authMiddleware, async (req, res) => {
  const betslipId = req.params.id;

  try {
    // Only allow owner to start watcher
    const bRes = await pool.query(
      "SELECT id, user_id, betslip_data FROM betslips WHERE id = $1",
      [betslipId]
    );
    if (bRes.rows.length === 0) return res.status(404).json({ message: "Betslip not found" });
    const betslip = bRes.rows[0];
    if (betslip.user_id !== req.userId) return res.status(403).json({ message: "Forbidden" });

    if (betslipWatchers[betslipId]) {
      return res.json({ message: "Already watching", watching: true });
    }

    startWatcher(betslipId);

    res.json({ message: 'Watcher started', watching: true });
  } catch (error) {
    console.error('Start watch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Stop watching a betslip
router.delete('/:id/watch', authMiddleware, async (req, res) => {
  const betslipId = req.params.id;
  try {
    if (!betslipWatchers[betslipId]) return res.json({ message: 'Not watching', watching: false });
    const { intervalId } = betslipWatchers[betslipId];
    clearInterval(intervalId);
    delete betslipWatchers[betslipId];
    res.json({ message: 'Watcher stopped', watching: false });
  } catch (error) {
    console.error('Stop watch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Inspect watch state
router.get('/:id/watch', authMiddleware, async (req, res) => {
  const betslipId = req.params.id;
  try {
    const watching = !!betslipWatchers[betslipId];
    res.json({ watching });
  } catch (error) {
    console.error('Watch status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
