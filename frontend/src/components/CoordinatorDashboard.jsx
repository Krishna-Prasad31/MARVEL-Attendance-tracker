
import { useCallback, useEffect, useMemo, useState } from "react";
import "./CoordinatorDashboard.css";

const API_URL = "";

function todayInIndia() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

async function request(url, options = {}) {
  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

function getDayStatus(day) {
  return day?.status ?? day?.dayStatus ?? null;
}

export default function CoordinatorDashboard() {
  const [date, setDate] = useState(todayInIndia);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [day, setDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [historyStudent, setHistoryStudent] = useState(null);
const [historyData, setHistoryData] = useState(null);
const [historyLoading, setHistoryLoading] = useState(false);
const [historyError, setHistoryError] = useState("");

  const loadDay = useCallback(async (selectedDate, { silent = false } = {}) => {
    if (!selectedDate) return;

    if (!silent) setLoading(true);
    setError("");
    setNotice("");

    try {
      // If this request fails, stop here. Never create a day
      // merely because loading the existing days failed.
      const dayResponse = await request("/api/attendance/days");

      const days = Array.isArray(dayResponse)
        ? dayResponse
        : dayResponse.days;

      if (!Array.isArray(days)) {
        throw new Error("Unexpected attendance days response.");
      }

      let currentDay = days.find((item) => item.date === selectedDate);

      // Create a day only when the list loaded successfully
      // and confirms this date doesn't exist yet.
      if (!currentDay) {
        const created = await request("/api/attendance/days", {
          method: "POST",
          body: JSON.stringify({ date: selectedDate }),
        });

        currentDay = created.day ?? created.attendanceDay ?? created;

        if (!currentDay?._id && !currentDay?.date) {
          throw new Error("The server did not return the created day.");
        }
      }

      // This endpoint returns the roster WITH saved attendance nested
      // inside each student as student.attendance.status.
      const recordsData = await request(
        `/api/attendance/days/${selectedDate}/records`
      );

      if (!Array.isArray(recordsData.students)) {
        throw new Error("Unexpected attendance records response.");
      }

      const savedAttendance = {};

      for (const student of recordsData.students) {
        if (student._id && student.attendance?.status) {
          savedAttendance[student._id] = student.attendance.status;
        }
      }

      setDay({
        ...currentDay,
        status: recordsData.dayStatus ?? getDayStatus(currentDay),
      });
      setStudents(recordsData.students);
      setAttendance(savedAttendance);
    } catch (err) {
      setError(err.message || "Unable to load attendance.");
      setDay(null);
      setStudents([]);
      setAttendance({});
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDay(date);
  }, [date, loadDay]);

  const markedCount = useMemo(
    () => students.filter((student) => Boolean(attendance[student._id])).length,
    [students, attendance]
  );

  const allMarked =
    students.length > 0 && markedCount === students.length;

  const isFinalized = getDayStatus(day) === "finalized";

  async function markStudent(student, status) {
    if (isFinalized || savingId || finalizing || loading) return;

    setSavingId(student._id);
    setError("");
    setNotice("");

    try {
      await request(
        `/api/attendance/days/${date}/students/${student._id}`,
        {
          method: "PUT",
          body: JSON.stringify({ status }),
        }
      );

      // Reflect the successful server response in the UI.
      setAttendance((previous) => ({
        ...previous,
        [student._id]: status,
      }));

      setNotice(`${student.name}: marked ${status}.`);
    } catch (err) {
      setError(err.message || "Unable to save attendance.");
    } finally {
      setSavingId(null);
    }
  }

  async function finalizeDay() {
    if (!allMarked || isFinalized || finalizing || savingId || loading) {
      return;
    }

    const confirmed = window.confirm(
      `Finalize attendance for ${date}? Check every student's status first.`
    );

    if (!confirmed) return;

    setFinalizing(true);
    setError("");
    setNotice("");

    try {
      await request(`/api/attendance/days/${date}/finalize`, {
        method: "POST",
      });

      // Reload authoritative day status and records from the backend.
      await loadDay(date, { silent: true });

      setNotice("Finalization request completed. Verify the day status above.");
    } catch (err) {
      setError(err.message || "Unable to finalize attendance.");
    } finally {
      setFinalizing(false);
    }
  }

  async function openStudentHistory(student) {
  setHistoryStudent(student);
  setHistoryData(null);
  setHistoryError("");
  setHistoryLoading(true);

  try {
    const data = await request(
      `/api/attendance/students/${student._id}/history`
    );

    setHistoryData(data);
  } catch (err) {
    setHistoryError(
      err.message || "Unable to load attendance history."
    );
  } finally {
    setHistoryLoading(false);
  }
}

  return (
    <main className="coordinator-page">
      <header className="coordinator-header">
        <div className="coordinator-brand">
          <div className="coordinator-logo">M</div>
          <div>
            <p className="coord-eyebrow">UVCE · MARVEL R&D LAB</p>
            <h1>Coordinator workspace</h1>
          </div>
        </div>

        <button
          className="coord-refresh"
          onClick={() => loadDay(date)}
          disabled={loading || Boolean(savingId) || finalizing}
        >
          ↻ {loading ? "Loading…" : "Refresh"}
        </button>
      </header>

      <section className="coord-welcome">
        <p className="coord-eyebrow">ATTENDANCE MANAGEMENT</p>
        <h2>Good work starts with showing up.</h2>
        <p>
          Review the roster, mark attendance, and verify before finalizing.
        </p>
      </section>

      <section className="coord-toolbar">
        <label className="coord-date-field">
          <span>Attendance date</span>
          <input
            type="date"
            value={date}
            max={todayInIndia()}
            onChange={(event) => setDate(event.target.value)}
            disabled={loading || Boolean(savingId) || finalizing}
          />
        </label>

        <div className="coord-day-status">
          <span
            className={`coord-status-dot ${isFinalized ? "done" : ""}`}
          />
          <div>
            <span className="coord-eyebrow">DAY STATUS</span>
            <strong>
              {loading
                ? "Loading…"
                : getDayStatus(day) || "Unavailable"}
            </strong>
          </div>
        </div>
      </section>

      {error && (
        <div className="coord-alert error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="coord-alert success" role="status">
          {notice}
        </div>
      )}

      <section className="coord-summary">
        <article>
          <span>Eligible students</span>
          <strong>{loading ? "—" : students.length}</strong>
        </article>

        <article>
          <span>Marked</span>
          <strong>{loading ? "—" : markedCount}</strong>
        </article>

        <article>
          <span>Remaining</span>
          <strong>{loading ? "—" : students.length - markedCount}</strong>
        </article>
      </section>

      <section className="coord-roster">
        <div className="coord-roster-heading">
          <div>
            <p className="coord-eyebrow">DAILY ROSTER</p>
            <h2>Mark attendance</h2>
          </div>

          <span>
            {markedCount}/{students.length} marked
          </span>
        </div>

        {loading ? (
          <div className="coord-empty">Loading eligible students…</div>
        ) : error && !day ? (
          <div className="coord-empty">
            Attendance could not be loaded. Fix the error above and refresh.
          </div>
        ) : students.length === 0 ? (
          <div className="coord-empty">
            No eligible students were found for this date.
          </div>
        ) : (
          <div className="coord-student-list">
            {students.map((student) => {
              const status = attendance[student._id];
              const isSaving = savingId === student._id;

              return (
                <article className="coord-student" key={student._id}>
                  <div className="coord-student-info">
                    <div className="coord-avatar">
                      {student.name?.trim().charAt(0).toUpperCase() || "M"}
                    </div>

                    <div>
                      <h3>{student.name}</h3>
                      <p>
                        {[student.domain, student.batch, student.level]
                          .filter(Boolean)
                          .join(" · ") || "MARVEL member"}
                      </p>
                    </div>
                  </div>

                  <div className="coord-actions">
                    <button
                      className={`attendance-button present ${
                        status === "present" ? "selected" : ""
                      }`}
                      onClick={() => markStudent(student, "present")}
                      disabled={
                        isFinalized ||
                        Boolean(savingId) ||
                        finalizing ||
                        loading
                      }
                    >
                      {isSaving ? "Saving…" : "Present"}
                    </button>

                    <button
                      className={`attendance-button absent ${
                        status === "absent" ? "selected" : ""
                      }`}
                      onClick={() => markStudent(student, "absent")}
                      disabled={
                        isFinalized ||
                        Boolean(savingId) ||
                        finalizing ||
                        loading
                      }
                    >
                      {isSaving ? "Saving…" : "Absent"}
                    </button>
                    <button
  className="coord-history-button"
  onClick={() => openStudentHistory(student)}
  disabled={Boolean(savingId) || finalizing}
>
  History
</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="coord-finalize-row">
          <div>
            <strong>
              {isFinalized
                ? "Attendance finalized"
                : allMarked
                  ? "Roster complete"
                  : "Review the full roster"}
            </strong>

            <p>
              {isFinalized
                ? "Normal attendance marking is locked."
                : "Every eligible student needs a Present or Absent status."}
            </p>
          </div>

          <button
            className="coord-finalize"
            onClick={finalizeDay}
            disabled={
              !allMarked ||
              isFinalized ||
              loading ||
              Boolean(savingId) ||
              finalizing
            }
          >
            {finalizing
              ? "Finalizing…"
              : isFinalized
                ? "Finalized ✓"
                : "Finalize day"}
          </button>
        </div>
      </section>


{historyStudent && (
  <div className="coord-history-overlay">
    <section
      className="coord-history-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-title"
    >
      <header className="coord-history-header">
        <div>
          <p className="coord-eyebrow">STUDENT RECORD</p>
          <h2 id="history-title">
            {historyStudent.name}
          </h2>
          <p>
            {historyStudent.usn} · {historyStudent.domain || "MARVEL"}
          </p>
        </div>

        <button
          className="coord-history-close"
          onClick={() => {
            setHistoryStudent(null);
            setHistoryData(null);
            setHistoryError("");
          }}
          aria-label="Close attendance history"
        >
          ×
        </button>
      </header>

      {historyLoading ? (
        <div className="coord-empty">
          Loading attendance history…
        </div>
      ) : historyError ? (
        <div className="coord-alert error">
          {historyError}
        </div>
      ) : historyData ? (
        <>
          <div className="coord-history-summary">
            <article>
              <span>Total records</span>
              <strong>{historyData.totalRecords}</strong>
            </article>
            <article>
              <span>Corrections</span>
              <strong>{historyData.totalCorrections}</strong>
            </article>
          </div>

          {historyData.history.length === 0 ? (
            <div className="coord-empty">
              No attendance records found for this student.
            </div>
          ) : (
            <div className="coord-history-list">
              {historyData.history.map((item) => (
                <article
                  className="coord-history-entry"
                  key={item.recordId}
                >
                  <div className="coord-history-entry-top">
                    <div>
                      <strong>{item.date}</strong>
                      <p>
                        {item.dayStatus === "finalized"
                          ? "Finalized attendance"
                          : "Draft attendance"}
                      </p>
                    </div>

                    <span
                      className={`coord-history-status ${
                        item.status
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  {item.markedBy && (
                    <p className="coord-history-meta">
                      Marked by: {item.markedBy.name}
                    </p>
                  )}

                  {item.corrections.length > 0 && (
                    <div className="coord-correction-list">
                      <strong>
                        Correction history
                      </strong>

                      {item.corrections.map((correction, index) => (
                        <div
                          className="coord-correction-item"
                          key={`${item.recordId}-${index}`}
                        >
                          <p>
                            <span className="correction-old">
                              {correction.previousStatus}
                            </span>
                            {" → "}
                            <span className="correction-new">
                              {correction.newStatus}
                            </span>
                          </p>

                          <p>
                            Reason: {correction.reason}
                          </p>

                          <p>
                            Changed by:{" "}
                            {correction.changedBy?.name || "Unknown"}
                          </p>

                          <p>
                            {new Date(
                              correction.changedAt
                            ).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  </div>
)}


      <footer className="coord-footer">
        <span>MARVEL · UVCE</span>
        <span>Coordinator workspace</span>
      </footer>
    </main>
  );
}
