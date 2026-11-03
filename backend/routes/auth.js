
const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/user");

const router = express.Router();

// LOGIN
router.post("/login", async (req, res) => {
  console.log("LOGIN ROUTE HIT", req.method, req.originalUrl);

  try {
    const username = String(req.body?.username || "")
      .trim()
      .toLowerCase();

    const password = req.body?.password;

    if (!username || typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "Username and password are required.",
      });
    }

    const user = await User.findOne({ username })
      .select("+passwordHash");

    if (!user || !user.isActive) {
      return res.status(401).json({
        message: "Invalid username or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid username or password.",
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regeneration failed:", err.message);

        return res.status(500).json({
          message: "Unable to start a session.",
        });
      }

      req.session.user = {
        id: user._id.toString(),
        username: user.username,
        name: user.name,
        role: user.role,
      };

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Session save failed:", saveError.message);

          return res.status(500).json({
            message: "Unable to save the session.",
          });
        }

        return res.status(200).json({
          message: "Login successful.",
          user: req.session.user,
        });
      });
    });
  } catch (error) {
    console.error("Login failed:", error.message);

    return res.status(500).json({
      message: "Login failed.",
    });
  }
});

// CHECK CURRENT SESSION
router.get("/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({
      message: "Not authenticated.",
    });
  }

  return res.status(200).json({
    user: req.session.user,
  });
});

// LOGOUT
router.post("/logout", (req, res) => {
  if (!req.session) {
    return res.json({
      message: "Logged out.",
    });
  }

  req.session.destroy((err) => {
    if (err) {
      console.error("Logout failed:", err.message);

      return res.status(500).json({
        message: "Unable to log out.",
      });
    }

    res.clearCookie("marvel.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(200).json({
      message: "Logged out successfully.",
    });
  });
});

module.exports = router;
