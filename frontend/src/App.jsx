
import { useEffect, useState } from "react";
import "./App.css";
import CoordinatorDashboard from "./components/CoordinatorDashboard";
import AdminDashboard from "./components/adminDashboard";

const API_URL = "";

function LoginScreen({ onLogin, onBack }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      onLogin(data.user);
    } catch (err) {
      setError(err.message || "Unable to connect to the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand-mark auth-mark">M</div>

        <p className="eyebrow">UVCE · MARVEL R&D LAB</p>
        <h1>Welcome back.</h1>
        <p className="auth-description">
          Sign in to access the MARVEL attendance management system.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter your username"
            autoComplete="username"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <button className="back-button" onClick={onBack}>
          ← Back to TV dashboard
        </button>
      </div>
    </main>
  );
}

function App() {
  const [students, setStudents] = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isStale, setIsStale] = useState(false);

  const [view, setView] = useState("tv");
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Restore an existing login session.
  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          credentials: "include",
        });

        if (!response.ok) {
          if (mounted) setUser(null);
          return;
        }

        const data = await response.json();

        if (mounted) {
          setUser(data.user);
        }
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setCheckingSession(false);
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  // Public TV dashboard.
  useEffect(() => {
    let mounted = true;

    async function fetchDashboard() {
      try {
        const response = await fetch(
          `${API_URL}/api/attendance/dashboard`
        );

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const data = await response.json();

        if (!Array.isArray(data.students)) {
          throw new Error("Unexpected dashboard response");
        }

        if (!mounted) return;

        setStudents(data.students);
        setStudentCount(data.studentCount ?? data.students.length);
        setLastUpdated(new Date());
        setError("");
        setIsStale(false);
      } catch (err) {
        if (!mounted) return;

        setError(err.message || "Unable to connect to the server");
        setIsStale(true);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchDashboard();

    const interval = setInterval(fetchDashboard, 30_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  async function handleLogout() {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    }

    setUser(null);
    setView("tv");
  }

  const averageAttendance = (() => {
    const values = students
      .map((student) => student.attendancePercentage)
      .filter(
        (value) =>
          typeof value === "number" &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= 100
      );

    if (values.length === 0) return null;

    return (
      values.reduce((total, value) => total + value, 0) / values.length
    ).toFixed(1);
  })();

  return (
    <>
      <nav className="view-switcher" aria-label="Dashboard view">
        <button
          className={view === "tv" ? "active" : ""}
          onClick={() => setView("tv")}
        >
          TV dashboard
        </button>

        <button
          className={view === "coordinator" ? "active" : ""}
          onClick={() => setView("coordinator")}
        >
          {user
  ? user.role === "admin"
    ? "Admin dashboard"
    : "Coordinator dashboard"
  : "Coordinator login"}
        </button>

        {user && (
          <div className="auth-nav-user">
            <span>{user.name}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        )}
      </nav>

      {view === "coordinator" ? (
  checkingSession ? (
    <div className="auth-loading">Checking session...</div>
  ) : user ? (
    user.role === "admin" ? (
      <AdminDashboard user={user} />
    ) : (
      <CoordinatorDashboard />
    )
  ) : (
    <LoginScreen
      onLogin={(loggedInUser) => setUser(loggedInUser)}
      onBack={() => setView("tv")}
    />
  )
) : (
        <main className="dashboard">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark">M</div>
              <div>
                <p className="eyebrow">UVCE · MARVEL R&D LAB</p>
                <h1>Attendance Overview</h1>
              </div>
            </div>

            <div className="live-status">
              <span className={`status-dot ${isStale ? "offline" : ""}`} />
              <span>
                {isStale ? "Connection interrupted" : "Live dashboard"}
              </span>
            </div>
          </header>

          <section className="intro">
            <div>
              <p className="eyebrow">STUDENT ENGAGEMENT</p>
              <h2>Consistency builds excellence.</h2>
              <p className="intro-copy">
                A live overview of attendance across the MARVEL community.
              </p>
            </div>

            <div className="refresh-info">
              <span className="refresh-icon">↻</span>
              <div>
                <span className="meta-label">LAST UPDATED</span>
                <strong>
                  {lastUpdated
                    ? lastUpdated.toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "Waiting for data"}
                </strong>
              </div>
            </div>
          </section>

          {error && (
            <div className="notice" role="status">
              {isStale && students.length > 0
                ? "Connection lost. Showing the last successfully loaded data."
                : `Unable to load attendance: ${error}`}
            </div>
          )}

          <section className="stats-grid" aria-label="Attendance summary">
            <article className="stat-card">
              <span className="stat-label">ACTIVE STUDENTS</span>
              <strong className="stat-value">
                {loading && students.length === 0 ? "—" : studentCount}
              </strong>
              <span className="stat-foot">Current MARVEL roster</span>
            </article>

            <article className="stat-card">
              <span className="stat-label">AVERAGE ATTENDANCE</span>
              <strong className="stat-value">
                {averageAttendance === null
                  ? "N/A"
                  : `${averageAttendance}%`}
              </strong>
              <span className="stat-foot">
                Across students with recorded attendance
              </span>
            </article>

            <article className="stat-card">
              <span className="stat-label">DATA STATUS</span>
              <strong className="stat-value status-value">
                {loading && students.length === 0
                  ? "Loading"
                  : isStale
                    ? "Stale"
                    : "Current"}
              </strong>
              <span className="stat-foot">
                Automatic refresh every 30 seconds
              </span>
            </article>
          </section>

          <section className="roster-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">THE COMMUNITY</p>
                <h2>Student roster</h2>
              </div>

              <span className="student-total">
                {studentCount}{" "}
                {studentCount === 1 ? "STUDENT" : "STUDENTS"}
              </span>
            </div>

            {loading && students.length === 0 ? (
              <div className="empty-state">
                <div className="loader" />
                <p>Loading the MARVEL roster…</p>
              </div>
            ) : students.length === 0 ? (
              <div className="empty-state">
                <div className="empty-symbol">M</div>
                <h3>No active students yet</h3>
                <p>
                  Once the roster is added, student attendance will appear
                  here.
                </p>
              </div>
            ) : (
              <div className="student-grid">
                {students.map((student) => {
                  const percentage = student.attendancePercentage;
                  const validPercentage =
                    typeof percentage === "number" &&
                    Number.isFinite(percentage) &&
                    percentage >= 0 &&
                    percentage <= 100;

                  return (
                    <article
                      className="student-card"
                      key={`${student.name}-${student.domain}`}
                    >
                      <div className="student-details">
                        <div className="student-avatar" aria-hidden="true">
                          {student.name?.trim().charAt(0).toUpperCase() || "M"}
                        </div>

                        <div className="student-text">
                          <h3>{student.name}</h3>
                          <p>{student.domain || "MARVEL Member"}</p>
                        </div>
                      </div>

                      <div className="attendance-details">
                        <strong className="attendance-value">
                          {validPercentage
                            ? `${percentage.toFixed(1)}%`
                            : "N/A"}
                        </strong>

                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{
                              width: validPercentage
                                ? `${percentage}%`
                                : "0%",
                            }}
                          />
                        </div>

                        <span className="attendance-caption">
                          {validPercentage
                            ? "Recorded attendance"
                            : "No finalized records"}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <footer className="dashboard-footer">
            <span>MARVEL · UVCE</span>
            <span>Built for the community.</span>
          </footer>
        </main>
      )}
    </>
  );
}

export default App;
