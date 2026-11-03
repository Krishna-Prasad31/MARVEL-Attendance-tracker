
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const studentRoutes = require("./routes/student");
const attendanceRoutes = require("./routes/attendance");
const authRoutes = require("./routes/auth");
const { requireAuth, requireRole } = require("./middleware/auth")
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" }));

async function startServer() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing from backend/.env");
  }

  await connectDB();

  app.use(
    session({
      name: "marvel.sid",
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        client: mongoose.connection.getClient(),
        collectionName: "sessions",
        ttl: 8 * 60 * 60,
      }),
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 8 * 60 * 60 * 1000,
      },
    })
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
app.use("/api/students", studentRoutes);

// Public TV dashboard; all other attendance endpoints require login.
app.use(
  "/api/attendance",
  (req, res, next) => {
    if (req.method === "GET" && req.path === "/dashboard") {
      return next();
    }

    return requireAuth(req, res, () =>
      requireRole("admin", "coordinator")(req, res, next)
    );
  },
  attendanceRoutes
);

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      message: "MARVEL Attendance API is running",
    });
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
