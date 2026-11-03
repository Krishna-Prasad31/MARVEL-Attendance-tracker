
const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
  {
    attendanceDay: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceDay",
      required: true,
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    status: {
      type: String,
      enum: ["present", "absent"],
      required: true,
    },

    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    markedAt: {
      type: Date,
      default: Date.now,
    },

    version: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// A student can have only one record per attendance day.
attendanceRecordSchema.index(
  { attendanceDay: 1, student: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "AttendanceRecord",
  attendanceRecordSchema
);
