
const mongoose = require("mongoose");

const attendanceAuditSchema = new mongoose.Schema(
  {
    attendanceDay: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceDay",
      required: true,
      index: true,
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    attendanceRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceRecord",
      required: true,
    },

    previousStatus: {
      type: String,
      enum: ["present", "absent"],
      required: true,
    },

    newStatus: {
      type: String,
      enum: ["present", "absent"],
      required: true,
    },

    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    recordVersion: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

attendanceAuditSchema.index({
  attendanceDay: 1,
  student: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  "AttendanceAudit",
  attendanceAuditSchema
);
