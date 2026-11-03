
const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    usn: {
      type: String,
      required: true,
      trim: true,
    },

    usnCanonical: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    domain: {
      type: String,
      trim: true,
      default: "",
    },

    batch: {
      type: String,
      trim: true,
      default: "",
    },

    level: {
      type: String,
      trim: true,
      default: "",
    },

    enrollmentDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    endDate: {
      type: String,
      default: null,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"],
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Student", studentSchema);
