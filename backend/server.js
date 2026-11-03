
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
const adminRoutes = require("./routes/admin");
const { requireAuth, requireRole } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render's reverse proxy.
app.set("trust proxy", 1);

// Allow local development and the deployed frontend.
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header, such as health checks.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" }));

async function startServer() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing.");
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing.");
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
        sameSite:
          process.env.NODE_ENV === "production" ? "none" : "lax",
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MARVEL Attendance API listening on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
