const express = require("express");
const AttendanceDay = require("../models/attendanceDay");
const Student = require("../models/student");
const AttendanceRecord = require("../models/attendanceRecords");
const AttendanceAudit = require("../models/attendanceAudit");

const router = express.Router();

// Create or retrieve an attendance day.
router.post("/days", async (req, res) => {
  try {
    const { date } = req.body;

    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      return res.status(400).json({
        message: "A date in YYYY-MM-DD format is required",
      });
    }

    // Validate that the date is a real calendar date.
    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        message: "Invalid calendar date",
      });
    }

    // Prevent future dates. Calendar timezone: Asia/Kolkata.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    if (date > today) {
      return res.status(400).json({
        message: "Cannot create attendance for a future date",
      });
    }

    // Idempotent: repeated requests return the same day's document.
    const day = await AttendanceDay.findOneAndUpdate(
      { date },
      { $setOnInsert: { date, status: "draft" } },
      { returnDocument: "after", upsert: true, runValidators: true }
    );

    return res.status(200).json({
      message: "Attendance day retrieved or created",
      day,
    });
  } catch (error) {
    console.error("Attendance day operation failed:", error.message);
    return res.status(500).json({
      message: "Failed to retrieve or create attendance day",
    });
  }
});

// List attendance days, newest first.
router.get("/days", async (req, res) => {
  try {
    const days = await AttendanceDay.find()
      .sort({ date: -1 })
      .limit(100);

    res.json(days);
  } catch (error) {
    console.error("List attendance days failed:", error.message);
    res.status(500).json({
      message: "Failed to retrieve attendance days",
    });
  }
});



/**
 * List students eligible for attendance on a date.
 * A student must have been enrolled by that date and
 * must not have an end date before that date.
 */
router.get("/days/:date/students", async (req, res) => {
  try {
    const { date } = req.params;

    // Validate YYYY-MM-DD and reject impossible dates.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        message: "Date must use YYYY-MM-DD format",
      });
    }

    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        message: "Invalid calendar date",
      });
    }

    // Include active students enrolled by this date whose
    // effective end date has not passed.
    const students = await Student.find({
      isActive: true,
      enrollmentDate: { $lte: date },
      $or: [
        { endDate: null },
        { endDate: { $gte: date } },
      ],
    })
      .select("name usn domain batch level enrollmentDate endDate")
      .sort({ name: 1 });

    return res.json({
      date,
      count: students.length,
      students,
    });
  } catch (error) {
    console.error("Eligible students lookup failed:", error.message);

    return res.status(500).json({
      message: "Failed to retrieve eligible students",
    });
  }
});


router.get("/days/:date/records", async (req, res) => {
  try {
    const { date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        message: "Date must use YYYY-MM-DD format",
      });
    }

    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        message: "Invalid calendar date",
      });
    }

    const day = await AttendanceDay.findOne({ date }).lean();

    if (!day) {
      return res.status(404).json({
        message: "Attendance day not found. Create it first.",
      });
    }

    const students = await Student.find({
      isActive: true,
      enrollmentDate: { $lte: date },
      $or: [
        { endDate: null },
        { endDate: { $gte: date } },
      ],
    })
      .select("name usn domain batch level enrollmentDate endDate")
      .sort({ name: 1 })
      .lean();

    const records = await AttendanceRecord.find({
      attendanceDay: day._id,
    })
      .select("student status markedAt version")
      .lean();

    const recordsByStudent = new Map(
      records.map((record) => [
        record.student.toString(),
        {
          status: record.status,
          markedAt: record.markedAt,
          version: record.version,
        },
      ])
    );

    return res.json({
      date,
      dayStatus: day.status,
      students: students.map((student) => ({
        ...student,
        attendance: recordsByStudent.get(student._id.toString()) || null,
      })),
    });
  } catch (error) {
    console.error("Fetch attendance records failed:", error.message);

    return res.status(500).json({
      message: "Failed to retrieve attendance records",
    });
  }
});



router.put("/days/:date/students/:studentId", async (req, res) => {
  try {
    const { date, studentId } = req.params;
    const { status } = req.body;

    if (!["present", "absent"].includes(status)) {
      return res.status(400).json({
        message: "Status must be present or absent",
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        message: "Date must use YYYY-MM-DD format",
      });
    }

    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        message: "Invalid calendar date",
      });
    }

    if (!/^[a-f\d]{24}$/i.test(studentId)) {
      return res.status(400).json({
        message: "Invalid student ID",
      });
    }

    const day = await AttendanceDay.findOne({ date });

    if (!day) {
      return res.status(404).json({
        message: "Attendance day not found. Create it first.",
      });
    }

    if (day.status !== "draft") {
      return res.status(409).json({
        message: "Attendance can only be marked on draft days",
      });
    }

    const student = await Student.findOne({
      _id: studentId,
      isActive: true,
      enrollmentDate: { $lte: date },
      $or: [
        { endDate: null },
        { endDate: { $gte: date } },
      ],
    });

    if (!student) {
      return res.status(404).json({
        message: "Eligible active student not found",
      });
    }

    const record = await AttendanceRecord.findOneAndUpdate(
      {
        attendanceDay: day._id,
        student: student._id,
      },
      {
        $setOnInsert: {
          attendanceDay: day._id,
          student: student._id,
        },
        $set: {
  status,
  markedAt: new Date(),
  markedBy: req.user.id,
},
        $inc: {
          version: 1,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
      }
    );

    return res.json({
      message: "Attendance saved",
      record,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Conflicting attendance record. Retry the request.",
      });
    }

    console.error("Mark attendance failed:", error.message);

    return res.status(500).json({
      message: "Failed to save attendance",
    });
  }
});



router.post("/days/:date/finalize", async (req, res) => {
  try {
    const { date } = req.params;

    // Validate the calendar date.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        message: "Date must use YYYY-MM-DD format",
      });
    }

    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        message: "Invalid calendar date",
      });
    }

    // Find the day and ensure it is still a draft.
    const day = await AttendanceDay.findOne({ date });

    if (!day) {
      return res.status(404).json({
        message: "Attendance day not found",
      });
    }

    if (day.status !== "draft") {
      return res.status(409).json({
        message: `Cannot finalize a day with status '${day.status}'`,
      });
    }

    // Find students eligible on this date.
    const eligibleStudents = await Student.find({
      isActive: true,
      enrollmentDate: { $lte: date },
      $or: [
        { endDate: null },
        { endDate: { $gte: date } },
      ],
    }).select("_id");

    const eligibleIds = eligibleStudents.map((student) =>
      student._id.toString()
    );

    // Find records that belong to eligible students.
    const records = await AttendanceRecord.find({
      attendanceDay: day._id,
      student: { $in: eligibleStudents.map((s) => s._id) },
    }).select("student status");

    const recordedIds = new Set(
      records.map((record) => record.student.toString())
    );

    const missingIds = eligibleIds.filter(
      (id) => !recordedIds.has(id)
    );

    if (missingIds.length > 0) {
      return res.status(409).json({
        message: "Cannot finalize: some eligible students are unmarked",
        eligibleCount: eligibleIds.length,
        markedCount: recordedIds.size,
        unmarkedCount: missingIds.length,
      });
    }

    // Atomically transition only a draft to finalized.
    // Concurrent finalization attempts cannot both succeed.
    const finalizedDay = await AttendanceDay.findOneAndUpdate(
      { _id: day._id, status: "draft" },
      {
        $set: {
          status: "finalized",
          finalizedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
        runValidators: true,
      }
    );

    if (!finalizedDay) {
      return res.status(409).json({
        message: "The day was changed by another request. Refresh and retry.",
      });
    }

    return res.json({
      message: "Attendance finalized successfully",
      day: finalizedDay,
      eligibleCount: eligibleIds.length,
      markedCount: records.length,
    });
  } catch (error) {
    console.error("Finalize attendance failed:", error.message);

    return res.status(500).json({
      message: "Failed to finalize attendance",
    });
  }
});


router.get("/students/:studentId/percentage", async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!/^[a-f\d]{24}$/i.test(studentId)) {
      return res.status(400).json({
        message: "Invalid student ID",
      });
    }

    const student = await Student.findById(studentId).select(
      "name usn enrollmentDate endDate isActive"
    );

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    // Only finalized days within the student's enrollment period count.
    const dayFilter = {
      status: "finalized",
      date: { $gte: student.enrollmentDate },
    };

    if (student.endDate) {
      dayFilter.date.$lte = student.endDate;
    }

    const finalizedDays = await AttendanceDay.find(dayFilter)
      .select("_id date")
      .lean();

    const dayIds = finalizedDays.map((day) => day._id);

    // Count only valid attendance records for this student.
    const records = dayIds.length
      ? await AttendanceRecord.find({
          attendanceDay: { $in: dayIds },
          student: student._id,
          status: { $in: ["present", "absent"] },
        })
          .select("attendanceDay status")
          .lean()
      : [];

    // A finalized day counts for this student only when their
    // attendance record exists and is valid.
    const recordsByDay = new Map(
      records.map((record) => [
        record.attendanceDay.toString(),
        record.status,
      ])
    );

    let present = 0;
    let absent = 0;

    for (const day of finalizedDays) {
      const status = recordsByDay.get(day._id.toString());

      if (status === "present") present++;
      if (status === "absent") absent++;
    }

    const denominator = present + absent;
    const percentage =
      denominator === 0
        ? null
        : Math.floor((present / denominator) * 1000 + 0.5) / 10;

    return res.json({
      student: {
        id: student._id,
        name: student.name,
        usn: student.usn,
      },
      attendance: {
        present,
        absent,
        totalEligibleFinalizedDays: denominator,
        percentage,
        displayPercentage:
          percentage === null ? "N/A" : `${percentage.toFixed(1)}%`,
      },
    });
  } catch (error) {
    console.error("Attendance percentage failed:", error.message);

    return res.status(500).json({
      message: "Failed to calculate attendance percentage",
    });
  }
});


router.get("/dashboard", async (req, res) => {
  try {
    const students = await Student.find({ isActive: true })
      .select("name domain enrollmentDate endDate")
      .sort({ name: 1 })
      .lean();

    const finalizedDays = await AttendanceDay.find({
      status: "finalized",
    })
      .select("_id date")
      .lean();

    const dayIds = finalizedDays.map((day) => day._id);

    const records = dayIds.length
      ? await AttendanceRecord.find({
          attendanceDay: { $in: dayIds },
          status: { $in: ["present", "absent"] },
        })
          .select("attendanceDay student status")
          .lean()
      : [];

    const dayById = new Map(
      finalizedDays.map((day) => [day._id.toString(), day.date])
    );

    const recordsByStudent = new Map();

    for (const record of records) {
      const studentId = record.student.toString();
      const date = dayById.get(record.attendanceDay.toString());

      if (!date) continue;

      const studentRecords = recordsByStudent.get(studentId) || [];
      studentRecords.push({ date, status: record.status });
      recordsByStudent.set(studentId, studentRecords);
    }

    const dashboardStudents = students.map((student) => {
      const eligibleRecords = (
        recordsByStudent.get(student._id.toString()) || []
      ).filter(({ date }) =>
        date >= student.enrollmentDate &&
        (!student.endDate || date <= student.endDate)
      );

      const present = eligibleRecords.filter(
        (record) => record.status === "present"
      ).length;

      const absent = eligibleRecords.filter(
        (record) => record.status === "absent"
      ).length;

      const total = present + absent;
      const percentage =
        total === 0
          ? null
          : Math.floor((present / total) * 1000 + 0.5) / 10;

      return {
        name: student.name,
        domain: student.domain,
        attendancePercentage: percentage,
        displayPercentage:
          percentage === null ? "N/A" : `${percentage.toFixed(1)}%`,
      };
    });

    res.set("Cache-Control", "no-store");

    return res.json({
      generatedAt: new Date().toISOString(),
      studentCount: dashboardStudents.length,
      students: dashboardStudents,
    });
  } catch (error) {
    console.error("Dashboard data failed:", error.message);

    return res.status(500).json({
      message: "Failed to retrieve dashboard data",
    });
  }
});


/**
 * Correct attendance after a day has been finalized.
 * Requires explicit confirmation and a reason.
 * Saves the correction and audit entry in one transaction.
 */
router.patch(
  "/days/:date/students/:studentId/correction",
  async (req, res) => {
    const { date, studentId } = req.params;
    const { status, reason, confirmed } = req.body || {};

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        message: "Date must use YYYY-MM-DD format",
      });
    }

    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        message: "Invalid calendar date",
      });
    }

    if (!mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({
        message: "Invalid student ID",
      });
    }

    if (!["present", "absent"].includes(status)) {
      return res.status(400).json({
        message: "Status must be present or absent",
      });
    }

    if (confirmed !== true) {
      return res.status(400).json({
        message: "Explicit confirmation is required",
      });
    }

    if (
      typeof reason !== "string" ||
      reason.trim().length < 5 ||
      reason.trim().length > 500
    ) {
      return res.status(400).json({
        message: "Correction reason must be between 5 and 500 characters",
      });
    }

    let session;

    try {
      session = await mongoose.startSession();

      let correctedRecord = null;

      await session.withTransaction(async () => {
        const day = await AttendanceDay.findOne({ date }).session(session);

        if (!day) {
          throw Object.assign(
            new Error("Attendance day not found"),
            { statusCode: 404 }
          );
        }

        if (day.status !== "finalized") {
          throw Object.assign(
            new Error("Corrections are only allowed on finalized days"),
            { statusCode: 409 }
          );
        }

        const record = await AttendanceRecord.findOne({
          attendanceDay: day._id,
          student: studentId,
        }).session(session);

        if (!record) {
          throw Object.assign(
            new Error("Attendance record not found"),
            { statusCode: 404 }
          );
        }

        if (record.status === status) {
          throw Object.assign(
            new Error("The student already has this attendance status"),
            { statusCode: 409 }
          );
        }

        const previousStatus = record.status;
        const nextVersion = record.version + 1;

        correctedRecord = await AttendanceRecord.findOneAndUpdate(
          {
            _id: record._id,
            version: record.version,
            status: previousStatus,
          },
          {
            $set: {
              status,
              markedBy: req.user.id,
              markedAt: new Date(),
            },
            $inc: {
              version: 1,
            },
          },
          {
            new: true,
            runValidators: true,
            session,
          }
        );

        if (!correctedRecord) {
          throw Object.assign(
            new Error("Attendance was changed by another request. Refresh and retry."),
            { statusCode: 409 }
          );
        }

        await AttendanceAudit.create(
          [
            {
              attendanceDay: day._id,
              student: studentId,
              attendanceRecord: record._id,
              previousStatus,
              newStatus: status,
              changedBy: req.user.id,
              reason: reason.trim(),
              recordVersion: nextVersion,
            },
          ],
          { session }
        );
      });

      return res.json({
        message: "Attendance corrected and audit entry saved successfully",
        record: correctedRecord,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          message: error.message,
        });
      }

      console.error("Attendance correction failed:", error);

      return res.status(500).json({
        message: "Failed to correct attendance",
      });
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  }
);



/**
 * Get a student's attendance history and correction history.
 * Available to authenticated admins and coordinators.
 */
router.get("/students/:studentId/history", async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!/^[a-f\d]{24}$/i.test(studentId)) {
      return res.status(400).json({
        message: "Invalid student ID",
      });
    }

    const student = await Student.findById(studentId)
      .select("name usn domain batch level enrollmentDate endDate")
      .lean();

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    // Fetch all attendance records for this student.
    const records = await AttendanceRecord.find({
      student: studentId,
    })
      .populate({
        path: "attendanceDay",
        select: "date status",
      })
      .populate({
        path: "markedBy",
        select: "name username",
      })
      .lean();

    // Fetch every correction audit entry.
    const audits = await AttendanceAudit.find({
      student: studentId,
    })
      .populate({
        path: "changedBy",
        select: "name username",
      })
      .sort({ createdAt: -1 })
      .lean();

    // Group audit entries by attendance record.
    const auditsByRecord = new Map();

    for (const audit of audits) {
      const recordId = audit.attendanceRecord.toString();
      const existing = auditsByRecord.get(recordId) || [];

      existing.push({
        previousStatus: audit.previousStatus,
        newStatus: audit.newStatus,
        reason: audit.reason,
        changedBy: audit.changedBy
          ? {
              name: audit.changedBy.name,
              username: audit.changedBy.username,
            }
          : null,
        changedAt: audit.createdAt,
        recordVersion: audit.recordVersion,
      });

      auditsByRecord.set(recordId, existing);
    }

    const history = records
      .filter((record) => record.attendanceDay)
      .map((record) => ({
        recordId: record._id,
        date: record.attendanceDay.date,
        dayStatus: record.attendanceDay.status,
        status: record.status,
        markedAt: record.markedAt,
        markedBy: record.markedBy
          ? {
              name: record.markedBy.name,
              username: record.markedBy.username,
            }
          : null,
        version: record.version,
        corrections:
          auditsByRecord.get(record._id.toString()) || [],
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return res.json({
      student,
      totalRecords: history.length,
      totalCorrections: audits.length,
      history,
    });
  } catch (error) {
    console.error("Student attendance history failed:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve student attendance history",
    });
  }
});


module.exports = router;
