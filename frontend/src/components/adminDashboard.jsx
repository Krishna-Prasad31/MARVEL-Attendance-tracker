
import { useCallback, useEffect, useMemo, useState } from "react";
import "./adminDashboard.css";

const API_URL = "";

const DOMAIN_OPTIONS = [
  "Artificial Intelligence and Machine Learning (AI-ML)",
  "Internet of Things (IoT)",
  "Cloud Computing and Cybersecurity",
  "Design and Prototyping",
  "Electric Vehicles and Renewable Energy",
  "Aviation (including Drone Science)",
  "Visual Effects (VFX)",
  "VLSI (Focus group)",
];

const LEVEL_OPTIONS = ["1", "2", "3"];

const EMPTY_STUDENT = {
  name: "",
  usn: "",
  domain: "",
  batch: "",
  level: "",
  enrollmentDate: new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }),
  endDate: "",
};

async function apiRequest(url, options = {}) {
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

export default function AdminDashboard({ user }) {
  // Coordinator state
  const [coordinators, setCoordinators] = useState([]);
  const [coordinatorLoading, setCoordinatorLoading] = useState(true);
  const [coordinatorSubmitting, setCoordinatorSubmitting] = useState(false);
  const [updatingCoordinatorId, setUpdatingCoordinatorId] = useState(null);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Student state
  const [students, setStudents] = useState([]);
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentSubmitting, setStudentSubmitting] = useState(false);
  const [updatingStudentId, setUpdatingStudentId] = useState(null);

  const [studentForm, setStudentForm] = useState(EMPTY_STUDENT);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");

  // Shared feedback
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Attendance audit state
const [auditRows, setAuditRows] = useState([]);
const [auditLoading, setAuditLoading] = useState(true);
const [auditError, setAuditError] = useState("");
const [auditSearch, setAuditSearch] = useState("");
const [auditFrom, setAuditFrom] = useState("");
const [auditTo, setAuditTo] = useState("");
const [auditPage, setAuditPage] = useState(1);
const [auditTotal, setAuditTotal] = useState(0);
const [auditTotalPages, setAuditTotalPages] = useState(0);

  const loadCoordinators = useCallback(async () => {
    setCoordinatorLoading(true);

    try {
      const data = await apiRequest("/api/admin/coordinators");

      if (!Array.isArray(data.coordinators)) {
        throw new Error("Unexpected coordinator response.");
      }

      setCoordinators(data.coordinators);
    } catch (err) {
      setError(err.message || "Unable to load coordinators.");
    } finally {
      setCoordinatorLoading(false);
    }
  }, []);

  const loadStudents = useCallback(async () => {
    setStudentLoading(true);

    try {
      const data = await apiRequest("/api/students");

      const roster = Array.isArray(data)
        ? data
        : data.students;

      if (!Array.isArray(roster)) {
        throw new Error("Unexpected student response.");
      }

      setStudents(roster);
    } catch (err) {
      setError(err.message || "Unable to load students.");
    } finally {
      setStudentLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async ({
  page = 1,
  q = "",
  dateFrom = "",
  dateTo = "",
} = {}) => {
  setAuditLoading(true);
  setAuditError("");

  try {
    const params = new URLSearchParams({ page: String(page) });

    if (q.trim()) params.set("q", q.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    const data = await apiRequest(
      `/api/admin/audit?${params.toString()}`
    );

    setAuditRows(data.audits || []);
    setAuditTotal(data.total || 0);
    setAuditPage(data.page || 1);
    setAuditTotalPages(data.totalPages || 0);
  } catch (err) {
    setAuditError(err.message || "Unable to load audit history.");
    setAuditRows([]);
  } finally {
    setAuditLoading(false);
  }
}, []);

  useEffect(() => {
    loadCoordinators();
    loadStudents();
  }, [loadCoordinators, loadStudents]);

  useEffect(() => {
  loadAudit({ page: 1 });
}, [loadAudit]);

  // Coordinator management
  async function handleCreateCoordinator(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (password.length < 12) {
      setError("Password must contain at least 12 characters.");
      return;
    }

    setCoordinatorSubmitting(true);

    try {
      const data = await apiRequest("/api/admin/coordinators", {
        method: "POST",
        body: JSON.stringify({ name, username, password }),
      });

      setNotice(data.message || "Coordinator created successfully.");
      setName("");
      setUsername("");
      setPassword("");

      await loadCoordinators();
    } catch (err) {
      setError(err.message || "Unable to create coordinator.");
    } finally {
      setCoordinatorSubmitting(false);
    }
  }

  async function toggleCoordinatorStatus(coordinator) {
    const nextStatus = !coordinator.isActive;

    if (
      !window.confirm(
        `${nextStatus ? "Activate" : "Deactivate"} ${coordinator.name}'s account?`
      )
    ) {
      return;
    }

    setError("");
    setNotice("");
    setUpdatingCoordinatorId(coordinator._id);

    try {
      const data = await apiRequest(
        `/api/admin/coordinators/${coordinator._id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: nextStatus }),
        }
      );

      setCoordinators((previous) =>
        previous.map((item) =>
          item._id === coordinator._id
            ? { ...item, isActive: data.coordinator.isActive }
            : item
        )
      );

      setNotice(data.message || "Coordinator status updated.");
    } catch (err) {
      setError(err.message || "Unable to update coordinator.");
    } finally {
      setUpdatingCoordinatorId(null);
    }
  }

  // Student form management
  function updateStudentField(field, value) {
    setStudentForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function resetStudentForm() {
    setStudentForm(EMPTY_STUDENT);
    setEditingStudentId(null);
  }

  function startEditingStudent(student) {
    setError("");
    setNotice("");

    setEditingStudentId(student._id);

    setStudentForm({
      name: student.name || "",
      usn: student.usn || "",
      domain: student.domain || "",
      batch: student.batch || "",
      level: student.level || "",
      enrollmentDate: student.enrollmentDate || "",
      endDate: student.endDate || "",
    });

    document
      .getElementById("admin-student-form")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleStudentSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!studentForm.name.trim() || !studentForm.usn.trim()) {
      setError("Student name and USN are required.");
      return;
    }

    if (!studentForm.enrollmentDate) {
      setError("Enrollment date is required.");
      return;
    }

    if (
      studentForm.endDate &&
      studentForm.endDate < studentForm.enrollmentDate
    ) {
      setError("End date cannot be before enrollment date.");
      return;
    }

    setStudentSubmitting(true);

    const payload = {
      ...studentForm,
      name: studentForm.name.trim(),
      usn: studentForm.usn.trim().toUpperCase(),
      domain: studentForm.domain.trim(),
      batch: studentForm.batch.trim(),
      level: studentForm.level.trim(),
      endDate: studentForm.endDate || null,
    };

    try {
      const isEditing = Boolean(editingStudentId);

      const data = await apiRequest(
        isEditing
          ? `/api/students/${editingStudentId}`
          : "/api/students",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        }
      );

      setNotice(
        data.message ||
          (isEditing
            ? "Student updated successfully."
            : "Student created successfully.")
      );

      resetStudentForm();
      await loadStudents();
    } catch (err) {
      setError(err.message || "Unable to save student.");
    } finally {
      setStudentSubmitting(false);
    }
  }

  async function toggleStudentStatus(student) {
    const nextStatus = !student.isActive;

    const confirmed = window.confirm(
      `${nextStatus ? "Activate" : "Deactivate"} ${student.name} (${student.usn})? ${
        nextStatus
          ? ""
          : "Their historical attendance records will be preserved."
      }`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");
    setUpdatingStudentId(student._id);

    try {
      const data = await apiRequest(
        `/api/students/${student._id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: nextStatus }),
        }
      );

      setStudents((previous) =>
        previous.map((item) =>
          item._id === student._id
            ? { ...item, isActive: data.student.isActive }
            : item
        )
      );

      setNotice(data.message || "Student status updated.");
    } catch (err) {
      setError(err.message || "Unable to update student status.");
    } finally {
      setUpdatingStudentId(null);
    }
  }

  // Derived dashboard data
  const activeCoordinatorCount = coordinators.filter(
    (item) => item.isActive
  ).length;

  const activeStudentCount = students.filter(
    (item) => item.isActive
  ).length;

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();

    return students.filter((student) => {
      const matchesFilter =
        studentFilter === "all" ||
        (studentFilter === "active" && student.isActive) ||
        (studentFilter === "inactive" && !student.isActive);

      const matchesSearch =
        !query ||
        [student.name, student.usn, student.domain, student.batch]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));

      return matchesFilter && matchesSearch;
    });
  }, [students, studentSearch, studentFilter]);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="admin-brand">
          <div className="admin-logo">M</div>
          <div>
            <p className="admin-eyebrow">UVCE · MARVEL R&D LAB</p>
            <h1>Admin Console</h1>
          </div>
        </div>

        <button
          className="admin-refresh"
          onClick={() => {
            setError("");
            loadCoordinators();
            loadStudents();
          }}
          disabled={coordinatorLoading || studentLoading}
        >
          ↻ {coordinatorLoading || studentLoading ? "Loading..." : "Refresh"}
        </button>
      </header>

      <section className="admin-welcome">
        <div>
          <p className="admin-eyebrow">ADMINISTRATION</p>
          <h2>Welcome, {user?.name || "Administrator"}.</h2>
          <p>
            Manage coordinator accounts, student records and the MARVEL
            workspace.
          </p>
        </div>
        <span className="admin-role">ADMINISTRATOR</span>
      </section>

      {error && (
        <div className="admin-alert error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="admin-alert success" role="status">
          {notice}
        </div>
      )}

      {/* Dashboard statistics */}
      <section className="admin-stats">
        <article>
          <span>Total coordinators</span>
          <strong>{coordinatorLoading ? "—" : coordinators.length}</strong>
        </article>
        <article>
          <span>Active coordinators</span>
          <strong>{coordinatorLoading ? "—" : activeCoordinatorCount}</strong>
        </article>
        <article>
          <span>Active students</span>
          <strong>{studentLoading ? "—" : activeStudentCount}</strong>
        </article>
      </section>

      {/* Coordinator creation */}
      <section className="admin-create-section">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">ACCOUNT MANAGEMENT</p>
            <h2>Create coordinator</h2>
          </div>
        </div>

        <form
          className="admin-create-form"
          onSubmit={handleCreateCoordinator}
        >
          <label>
            Full name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter coordinator's name"
              maxLength={100}
              required
            />
          </label>

          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. john.doe"
              maxLength={100}
              pattern="[a-zA-Z0-9._-]+"
              required
            />
          </label>

          <label>
            Temporary password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 12 characters"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>

          <button type="submit" disabled={coordinatorSubmitting}>
            {coordinatorSubmitting ? "Creating..." : "+ Create account"}
          </button>
        </form>

        <p className="admin-form-hint">
          Share temporary login credentials securely. Never send passwords in
          public groups.
        </p>
      </section>

      {/* Coordinator roster */}
      <section className="admin-coordinator-section">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">TEAM ACCESS</p>
            <h2>Coordinators</h2>
          </div>
          <span className="admin-count">
            {coordinators.length} ACCOUNTS
          </span>
        </div>

        {coordinatorLoading ? (
          <div className="admin-empty">Loading coordinator accounts...</div>
        ) : coordinators.length === 0 ? (
          <div className="admin-empty">
            No coordinator accounts found. Create the first account above.
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Coordinator</th>
                  <th>Username</th>
                  <th>Date created</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {coordinators.map((coordinator) => (
                  <tr key={coordinator._id}>
                    <td><strong>{coordinator.name}</strong></td>
                    <td>{coordinator.username}</td>
                    <td>
                      {coordinator.createdAt
                        ? new Date(coordinator.createdAt).toLocaleDateString(
                            "en-IN",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`admin-status ${
                          coordinator.isActive ? "active" : "inactive"
                        }`}
                      >
                        {coordinator.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`admin-status-button ${
                          coordinator.isActive ? "deactivate" : "activate"
                        }`}
                        onClick={() => toggleCoordinatorStatus(coordinator)}
                        disabled={
                          updatingCoordinatorId === coordinator._id
                        }
                      >
                        {updatingCoordinatorId === coordinator._id
                          ? "Updating..."
                          : coordinator.isActive
                            ? "Deactivate"
                            : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Student creation and editing */}
      <section className="admin-create-section" id="admin-student-form">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">STUDENT MANAGEMENT</p>
            <h2>{editingStudentId ? "Edit student" : "Add a student"}</h2>
          </div>

          {editingStudentId && (
            <button
              type="button"
              className="admin-cancel-edit"
              onClick={resetStudentForm}
            >
              Cancel editing
            </button>
          )}
        </div>

        <form className="admin-student-form" onSubmit={handleStudentSubmit}>
          <label>
            Student name *
            <input
              type="text"
              value={studentForm.name}
              onChange={(event) =>
                updateStudentField("name", event.target.value)
              }
              placeholder="Full name"
              maxLength={150}
              required
            />
          </label>

          <label>
            USN *
            <input
              type="text"
              value={studentForm.usn}
              onChange={(event) =>
                updateStudentField("usn", event.target.value.toUpperCase())
              }
              placeholder="e.g. 1UV26EE001"
              maxLength={50}
              required
            />
          </label>

          <label>
  Domain *
  <select
    value={studentForm.domain}
    onChange={(event) =>
      updateStudentField("domain", event.target.value)
    }
    required
  >
    <option value="">Select a domain</option>

    {studentForm.domain &&
      !DOMAIN_OPTIONS.includes(studentForm.domain) && (
        <option value={studentForm.domain}>
          {studentForm.domain} (existing)
        </option>
      )}

    {DOMAIN_OPTIONS.map((domain) => (
      <option key={domain} value={domain}>
        {domain}
      </option>
    ))}
  </select>
</label>

          <label>
            Batch
            <input
              type="text"
              value={studentForm.batch}
              onChange={(event) =>
                updateStudentField("batch", event.target.value)
              }
              placeholder="Batch 9"
            />
          </label>

          <label>
  Level *
  <select
    value={studentForm.level}
    onChange={(event) =>
      updateStudentField("level", event.target.value)
    }
    required
  >
    <option value="">Select level</option>

    {studentForm.level &&
      !LEVEL_OPTIONS.includes(studentForm.level) && (
        <option value={studentForm.level}>
          {studentForm.level} (existing)
        </option>
      )}

    {LEVEL_OPTIONS.map((level) => (
      <option key={level} value={level}>
        Level {level}
      </option>
    ))}
  </select>
</label>

          <label>
            Enrollment date *
            <input
              type="date"
              value={studentForm.enrollmentDate}
              onChange={(event) =>
                updateStudentField("enrollmentDate", event.target.value)
              }
              required
            />
          </label>

          <label>
            End date
            <input
              type="date"
              value={studentForm.endDate}
              min={studentForm.enrollmentDate}
              onChange={(event) =>
                updateStudentField("endDate", event.target.value)
              }
            />
          </label>

          <div className="admin-student-form-actions">
            <button type="submit" disabled={studentSubmitting}>
              {studentSubmitting
                ? "Saving..."
                : editingStudentId
                  ? "Save changes"
                  : "+ Add student"}
            </button>
          </div>
        </form>

        <p className="admin-form-hint">
          USNs are stored in uppercase. Deactivating a student does not delete
          their historical attendance.
        </p>
      </section>

      {/* Student roster */}
      <section className="admin-coordinator-section admin-students-section">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">MARVEL ROSTER</p>
            <h2>Students</h2>
          </div>
          <span className="admin-count">
            {filteredStudents.length} STUDENTS
          </span>
        </div>

        <div className="admin-student-toolbar">
          <input
            type="search"
            value={studentSearch}
            onChange={(event) => setStudentSearch(event.target.value)}
            placeholder="Search by name, USN, domain or batch..."
            aria-label="Search students"
          />

          <select
            value={studentFilter}
            onChange={(event) => setStudentFilter(event.target.value)}
            aria-label="Filter students"
          >
            <option value="all">All students</option>
            <option value="active">Active students</option>
            <option value="inactive">Inactive students</option>
          </select>
        </div>

        {studentLoading ? (
          <div className="admin-empty">Loading student roster...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="admin-empty">
            {students.length === 0
              ? "No students found. Add the first student above."
              : "No students match your search or filter."}
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-student-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>USN</th>
                  <th>Domain</th>
                  <th>Batch</th>
                  <th>Enrollment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student._id}>
                    <td><strong>{student.name}</strong></td>
                    <td>{student.usn}</td>
                    <td>{student.domain || "—"}</td>
                    <td>{student.batch || "—"}</td>
                    <td>{student.enrollmentDate || "—"}</td>
                    <td>
                      <span
                        className={`admin-status ${
                          student.isActive ? "active" : "inactive"
                        }`}
                      >
                        {student.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="admin-student-actions">
                        <button
                          className="admin-edit-button"
                          onClick={() => startEditingStudent(student)}
                          disabled={Boolean(updatingStudentId)}
                        >
                          Edit
                        </button>

                        <button
                          className={`admin-status-button ${
                            student.isActive ? "deactivate" : "activate"
                          }`}
                          onClick={() => toggleStudentStatus(student)}
                          disabled={
                            updatingStudentId === student._id
                          }
                        >
                          {updatingStudentId === student._id
                            ? "Updating..."
                            : student.isActive
                              ? "Deactivate"
                              : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>


{/* =========================================
    ATTENDANCE AUDIT VIEWER
========================================= */}

<section className="admin-coordinator-section admin-audit-section">
  <div className="admin-section-heading">
    <div>
      <p className="admin-eyebrow">SYSTEM ACCOUNTABILITY</p>
      <h2>Attendance correction history</h2>
    </div>

    <span className="admin-count">
      {auditTotal} CORRECTIONS
    </span>
  </div>

  <form
    className="admin-audit-filters"
    onSubmit={(event) => {
      event.preventDefault();
      loadAudit({
        page: 1,
        q: auditSearch,
        dateFrom: auditFrom,
        dateTo: auditTo,
      });
    }}
  >
    <input
      type="search"
      value={auditSearch}
      onChange={(event) => setAuditSearch(event.target.value)}
      placeholder="Search student, USN or coordinator..."
      aria-label="Search audit records"
    />

    <label>
      <span>From</span>
      <input
        type="date"
        value={auditFrom}
        max={auditTo || undefined}
        onChange={(event) => setAuditFrom(event.target.value)}
      />
    </label>

    <label>
      <span>To</span>
      <input
        type="date"
        value={auditTo}
        min={auditFrom || undefined}
        onChange={(event) => setAuditTo(event.target.value)}
      />
    </label>

    <button type="submit" disabled={auditLoading}>
      {auditLoading ? "Searching..." : "Search"}
    </button>

    <button
      type="button"
      className="admin-audit-clear"
      disabled={auditLoading}
      onClick={() => {
        setAuditSearch("");
        setAuditFrom("");
        setAuditTo("");
        loadAudit({ page: 1 });
      }}
    >
      Clear
    </button>
  </form>

  {auditError && (
    <div className="admin-alert error" role="alert">
      {auditError}
    </div>
  )}

  {auditLoading ? (
    <div className="admin-empty">
      Loading correction history...
    </div>
  ) : auditRows.length === 0 ? (
    <div className="admin-empty">
      No attendance corrections found.
    </div>
  ) : (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table admin-audit-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Attendance date</th>
              <th>Change</th>
              <th>Reason</th>
              <th>Changed by</th>
              <th>Correction time</th>
            </tr>
          </thead>

          <tbody>
            {auditRows.map((audit) => (
              <tr key={audit._id}>
                <td>
                  <strong>
                    {audit.student?.name || "Unknown student"}
                  </strong>
                  <br />
                  <span className="admin-audit-muted">
                    {audit.student?.usn || "—"}
                  </span>
                </td>

                <td>
                  {audit.attendanceDay?.date || "—"}
                </td>

                <td>
                  <span className="admin-audit-old">
                    {audit.previousStatus}
                  </span>
                  {" → "}
                  <span className="admin-audit-new">
                    {audit.newStatus}
                  </span>
                </td>

                <td className="admin-audit-reason">
                  {audit.reason}
                </td>

                <td>
                  <strong>
                    {audit.changedBy?.name || "Unknown user"}
                  </strong>
                  <br />
                  <span className="admin-audit-muted">
                    {audit.changedBy?.username || "—"}
                  </span>
                </td>

                <td>
                  {audit.createdAt
                    ? new Date(audit.createdAt).toLocaleString(
                        "en-IN",
                        {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }
                      )
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-audit-pagination">
        <span>
          Page {auditPage} of {auditTotalPages}
          {" · "}
          {auditTotal} total corrections
        </span>

        <div>
          <button
            type="button"
            disabled={auditPage <= 1 || auditLoading}
            onClick={() =>
              loadAudit({
                page: auditPage - 1,
                q: auditSearch,
                dateFrom: auditFrom,
                dateTo: auditTo,
              })
            }
          >
            ← Previous
          </button>

          <button
            type="button"
            disabled={
              auditPage >= auditTotalPages || auditLoading
            }
            onClick={() =>
              loadAudit({
                page: auditPage + 1,
                q: auditSearch,
                dateFrom: auditFrom,
                dateTo: auditTo,
              })
            }
          >
            Next →
          </button>
        </div>
      </div>
    </>
  )}
</section>


      <footer className="admin-footer">
        <span>MARVEL · UVCE</span>
        <span>Administrator workspace</span>
      </footer>
    </main>
  );
}
