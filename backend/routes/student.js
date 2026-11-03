
const express = require("express");
const mongoose = require("mongoose");
const Student = require("../models/student");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const studentFields = [
  "name",
  "usn",
  "domain",
  "batch",
  "level",
  "enrollmentDate",
  "endDate",
];

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function validateStudentDates(enrollmentDate, endDate) {
  if (!isValidDate(enrollmentDate)) {
    return "A valid enrollment date in YYYY-MM-DD format is required.";
  }

  if (endDate !== undefined && endDate !== null && endDate !== "") {
    if (!isValidDate(endDate)) {
      return "End date must be a valid date in YYYY-MM-DD format.";
    }

    if (endDate < enrollmentDate) {
      return "End date cannot be before enrollment date.";
    }
  }

  return null;
}

// GET /api/students
// Admins and coordinators can view the roster.
router.get(
  "/",
  requireAuth,
  requireRole("admin", "coordinator"),
  async (req, res) => {
    try {
      const { search, status } = req.query;

      const filter = {};

      if (status === "active") filter.isActive = true;
      if (status === "inactive") filter.isActive = false;

      if (search && typeof search === "string") {
        const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        filter.$or = [
          { name: { $regex: escaped, $options: "i" } },
          { usnCanonical: { $regex: escaped.toUpperCase(), $options: "i" } },
          { domain: { $regex: escaped, $options: "i" } },
          { batch: { $regex: escaped, $options: "i" } },
        ];
      }

      const students = await Student.find(filter)
        .select("name usn domain batch level enrollmentDate endDate isActive createdAt updatedAt")
        .sort({ name: 1 })
        .lean();

      return res.json({
        count: students.length,
        students,
      });
    } catch (error) {
      console.error("List students failed:", error.message);

      return res.status(500).json({
        message: "Failed to retrieve students.",
      });
    }
  }
);

// POST /api/students
// Only admins can create students.
router.post(
  "/",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const {
        name,
        usn,
        domain,
        batch,
        level,
        enrollmentDate,
        endDate,
      } = req.body || {};

      if (
        typeof name !== "string" ||
        !name.trim() ||
        typeof usn !== "string" ||
        !usn.trim()
      ) {
        return res.status(400).json({
          message: "Name and USN are required.",
        });
      }

      if (name.trim().length > 150 || usn.trim().length > 50) {
        return res.status(400).json({
          message: "Name or USN exceeds the allowed length.",
        });
      }

      const dateError = validateStudentDates(enrollmentDate, endDate);

      if (dateError) {
        return res.status(400).json({ message: dateError });
      }

      const usnCanonical = usn.trim().toUpperCase();

      const student = await Student.create({
        name: name.trim(),
        usn: usnCanonical,
        usnCanonical,
        domain: typeof domain === "string" ? domain.trim() : "",
        batch: typeof batch === "string" ? batch.trim() : "",
        level: typeof level === "string" ? level.trim() : "",
        enrollmentDate,
        endDate: endDate || null,
      });

      return res.status(201).json({
        message: "Student created successfully.",
        student,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message: "A student with this USN already exists.",
        });
      }

      if (error.name === "ValidationError") {
        return res.status(400).json({ message: error.message });
      }

      console.error("Create student failed:", error.message);

      return res.status(500).json({
        message: "Failed to create student.",
      });
    }
  }
);

// PATCH /api/students/:id
// Only admins can edit student details.
router.patch(
  "/:id",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          message: "Invalid student ID.",
        });
      }

      const body = req.body || {};
      const updates = {};

      for (const field of studentFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          updates[field] = body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          message: "No valid student fields provided for update.",
        });
      }

      if (
        Object.prototype.hasOwnProperty.call(updates, "name")
      ) {
        if (
          typeof updates.name !== "string" ||
          !updates.name.trim() ||
          updates.name.trim().length > 150
        ) {
          return res.status(400).json({
            message: "A valid student name is required.",
          });
        }

        updates.name = updates.name.trim();
      }

      if (Object.prototype.hasOwnProperty.call(updates, "usn")) {
        if (
          typeof updates.usn !== "string" ||
          !updates.usn.trim() ||
          updates.usn.trim().length > 50
        ) {
          return res.status(400).json({
            message: "A valid USN is required.",
          });
        }

        updates.usn = updates.usn.trim().toUpperCase();
        updates.usnCanonical = updates.usn;
      }

      for (const field of ["domain", "batch", "level"]) {
        if (Object.prototype.hasOwnProperty.call(updates, field)) {
          if (typeof updates[field] !== "string") {
            return res.status(400).json({
              message: `${field} must be a string.`,
            });
          }

          updates[field] = updates[field].trim();
        }
      }

      if (Object.prototype.hasOwnProperty.call(updates, "endDate")) {
        updates.endDate = updates.endDate || null;
      }

      const existing = await Student.findById(id).lean();

      if (!existing) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      const finalEnrollmentDate =
        updates.enrollmentDate ?? existing.enrollmentDate;

      const finalEndDate = Object.prototype.hasOwnProperty.call(
        updates,
        "endDate"
      )
        ? updates.endDate
        : existing.endDate;

      const dateError = validateStudentDates(
        finalEnrollmentDate,
        finalEndDate
      );

      if (dateError) {
        return res.status(400).json({ message: dateError });
      }

      const student = await Student.findByIdAndUpdate(
        id,
        { $set: updates },
        {
          new: true,
          runValidators: true,
        }
      ).select(
        "name usn domain batch level enrollmentDate endDate isActive createdAt updatedAt"
      );

      return res.json({
        message: "Student updated successfully.",
        student,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          message: "Another student already uses this USN.",
        });
      }

      if (error.name === "ValidationError") {
        return res.status(400).json({ message: error.message });
      }

      console.error("Update student failed:", error.message);

      return res.status(500).json({
        message: "Failed to update student.",
      });
    }
  }
);

// PATCH /api/students/:id/status
// Deactivation preserves all historical attendance.
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body || {};

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          message: "Invalid student ID.",
        });
      }

      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          message: "isActive must be true or false.",
        });
      }

      const student = await Student.findByIdAndUpdate(
        id,
        { $set: { isActive } },
        {
          new: true,
          runValidators: true,
        }
      ).select(
        "name usn domain batch level enrollmentDate endDate isActive"
      );

      if (!student) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      return res.json({
        message: `Student ${isActive ? "activated" : "deactivated"} successfully.`,
        student,
      });
    } catch (error) {
      console.error("Update student status failed:", error.message);

      return res.status(500).json({
        message: "Failed to update student status.",
      });
    }
  }
);

module.exports = router;
