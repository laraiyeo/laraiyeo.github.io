const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const pool = require("../db/database");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// Signup
router.post(
  "/signup",
  [
    body("username").isLength({ min: 3 }).trim().escape(),
    body("password").isLength({ min: 6 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password, credits = 1000 } = req.body;

      // Check if user exists
      const existingUser = await pool.query(
        "SELECT id FROM users WHERE username = $1",
        [username]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const result = await pool.query(
        "INSERT INTO users (username, password_hash, credits) VALUES ($1, $2, $3) RETURNING id, username, credits, created_at",
        [username, passwordHash, credits]
      );

      const user = result.rows[0];

      // Generate JWT token
      if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET is not configured in environment");
        return res
          .status(500)
          .json({ message: "Server misconfiguration: JWT_SECRET not set" });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
      );

      res.status(201).json({
        message: "User created successfully",
        user: {
          id: user.id,
          username: user.username,
          credits: user.credits,
        },
        token,
      });
    } catch (error) {
      console.error(
        "Signup error:",
        error && error.stack ? error.stack : error
      );
      res.status(500).json({ message: "Server error during signup" });
    }
  }
);

// Login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log("Auth: login attempt for username:", username);

    // Get user
    const result = await pool.query(
      "SELECT id, username, password_hash, credits FROM users WHERE username = $1",
      [username]
    );
    console.log("Auth: DB query completed, rows:", result.rows.length);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    console.log(
      "Auth: password verification result for userId",
      user.id,
      "...",
      isValidPassword ? "valid" : "invalid"
    );

    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Generate JWT token
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured in environment");
      return res
        .status(500)
        .json({ message: "Server misconfiguration: JWT_SECRET not set" });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        credits: user.credits,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error && error.stack ? error.stack : error);
    res.status(500).json({ message: "Server error during login" });
  }
});

// Verify token
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, credits FROM users WHERE id = $1",
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Verify error:", error && error.stack ? error.stack : error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get user profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, credits, created_at FROM users WHERE id = $1",
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Profile error:", error && error.stack ? error.stack : error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update push token
router.post("/push-token", authMiddleware, async (req, res) => {
  try {
    const { pushToken } = req.body;

    await pool.query("UPDATE users SET push_token = $1 WHERE id = $2", [
      pushToken,
      req.userId,
    ]);

    res.json({ message: "Push token updated" });
  } catch (error) {
    console.error(
      "Push token error:",
      error && error.stack ? error.stack : error
    );
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
