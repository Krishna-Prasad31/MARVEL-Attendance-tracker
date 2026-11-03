
const mongoose = require("mongoose");

const attendanceDaySchema = new mongoose.Schema(
  {
    // Calendar date in Asia/Kolkata, stored as YYYY-MM-DD.
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      unique: true,
    },

    status: {
      type: String,
      enum: ["draft", "finalized", "holiday", "closed"],
      default: "draft",
      required: true,
    },

    finalizedAt: {
      type: Date,
      default: null,
    },

    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AttendanceDay", attendanceDaySchema);
