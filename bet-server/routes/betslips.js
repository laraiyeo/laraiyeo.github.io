const express = require("express");
const pool = require("../db/database");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

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

module.exports = router;
