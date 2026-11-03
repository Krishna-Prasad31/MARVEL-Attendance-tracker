const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/user");
const { requireAuth, requireRole } = require("../middleware/auth");

const AttendanceAudit = require("../models/attendanceAudit");
const AttendanceDay = require("../models/attendanceDay");
const Student = require("../models/student");

const router = express.Router();

// Every admin endpoint requires an authenticated admin account.
router.use(requireAuth, requireRole("admin"));

// GET /api/admin/coordinators
// List coordinator accounts without exposing password hashes.
router.get("/coordinators", async (req, res) => {
  try {
    const coordinators = await User.find({ role: "coordinator" })
      .select("_id name username isActive createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ coordinators });
  } catch (error) {
    console.error("Fetch coordinators failed:", error.message);
    return res.status(500).json({
      message: "Unable to retrieve coordinators.",
    });
  }
});

// POST /api/admin/coordinators
// Create a coordinator account. Public signup is not supported.
router.post("/coordinators", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = req.body?.password;

    if (!name || !username || typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "Name, username and password are required.",
      });
    }

    if (name.length > 100 || username.length > 100) {
      return res.status(400).json({
        message: "Name and username must not exceed 100 characters.",
      });
    }

    if (!/^[a-z0-9._-]+$/.test(username)) {
      return res.status(400).json({
        message:
          "Username can contain lowercase letters, numbers, dots, underscores and hyphens only.",
      });
    }

    if (password.length < 12 || password.length > 128) {
      return res.status(400).json({
        message: "Password must be between 12 and 128 characters.",
      });
    }

    const existingUser = await User.findOne({ username }).lean();

    if (existingUser) {
      return res.status(409).json({
        message: "That username is already taken.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const coordinator = await User.create({
      name,
      username,
      passwordHash,
      role: "coordinator",
      isActive: true,
    });

    return res.status(201).json({
      message: "Coordinator account created successfully.",
      coordinator: {
        id: coordinator._id,
        name: coordinator.name,
        username: coordinator.username,
        role: coordinator.role,
        isActive: coordinator.isActive,
        createdAt: coordinator.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "That username is already taken.",
      });
    }

    console.error("Create coordinator failed:", error.message);
    return res.status(500).json({
      message: "Unable to create coordinator account.",
    });
  }
});

// PATCH /api/admin/coordinators/:id/status
// Activate or deactivate a coordinator.
router.patch("/coordinators/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body || {};

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid coordinator ID.",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        message: "isActive must be true or false.",
      });
    }

    const coordinator = await User.findOneAndUpdate(
      { _id: id, role: "coordinator" },
      { $set: { isActive } },
      {
        new: true,
        runValidators: true,
      }
    ).select("_id name username role isActive updatedAt");

    if (!coordinator) {
      return res.status(404).json({
        message: "Coordinator account not found.",
      });
    }

    return res.json({
      message: `Coordinator ${isActive ? "activated" : "deactivated"} successfully.`,
      coordinator,
    });
  } catch (error) {
    console.error("Update coordinator status failed:", error.message);
    return res.status(500).json({
      message: "Unable to update coordinator status.",
    });
  }
});


// GET /api/admin/audit
// Search and paginate attendance correction history.
router.get("/audit", async (req, res) => {
  try {
    const { q = "", dateFrom, dateTo, page = "1" } = req.query;

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const limit = 50;
    const search = String(q).trim().slice(0, 100);

    const isValidDate = (value) => {
      if (!value) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    };

    if (!isValidDate(dateFrom) || !isValidDate(dateTo)) {
      return res.status(400).json({
        message: "Dates must use valid YYYY-MM-DD format.",
      });
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      return res.status(400).json({
        message: "Start date cannot be after end date.",
      });
    }

    const filter = {};

    // Filter by attendance date.
    if (dateFrom || dateTo) {
      const dateFilter = {};
      if (dateFrom) dateFilter.$gte = dateFrom;
      if (dateTo) dateFilter.$lte = dateTo;

      const days = await AttendanceDay.find({ date: dateFilter })
        .select("_id")
        .lean();

      const dayIds = days.map((day) => day._id);

      if (dayIds.length === 0) {
        return res.json({
          audits: [],
          total: 0,
          page: pageNumber,
          totalPages: 0,
        });
      }

      filter.attendanceDay = { $in: dayIds };
    }

    // Search student name/USN or coordinator name/username.
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");

      const [matchingStudents, matchingUsers] = await Promise.all([
        Student.find({
          $or: [{ name: regex }, { usn: regex }],
        }).select("_id").lean(),

        User.find({
          role: { $in: ["admin", "coordinator"] },
          $or: [{ name: regex }, { username: regex }],
        }).select("_id").lean(),
      ]);

      const studentIds = matchingStudents.map((item) => item._id);
      const userIds = matchingUsers.map((item) => item._id);

      if (studentIds.length === 0 && userIds.length === 0) {
        return res.json({
          audits: [],
          total: 0,
          page: pageNumber,
          totalPages: 0,
        });
      }

      filter.$or = [];

      if (studentIds.length) {
        filter.$or.push({ student: { $in: studentIds } });
      }

      if (userIds.length) {
        filter.$or.push({ changedBy: { $in: userIds } });
      }
    }

    const total = await AttendanceAudit.countDocuments(filter);

    const audits = await AttendanceAudit.find(filter)
      .populate("student", "name usn domain")
      .populate("attendanceDay", "date")
      .populate("changedBy", "name username role")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      audits,
      total,
      page: pageNumber,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Fetch attendance audit failed:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve attendance audit history.",
    });
  }
});


module.exports = router;