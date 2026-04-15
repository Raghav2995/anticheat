import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { AttemptSummary, Exam, ProctorEvent, Semester } from "@anticheat/shared-types";

const apiUrl = "http://127.0.0.1:4000";

export const App = (): JSX.Element => {
  const [email, setEmail] = useState("teacher@college.edu");
  const [password, setPassword] = useState("teacher123");
  const [token, setToken] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [events, setEvents] = useState<ProctorEvent[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState("");
  const [newExamName, setNewExamName] = useState("");
  const [newExamStartDateTime, setNewExamStartDateTime] = useState("");
  const [newExamEndDateTime, setNewExamEndDateTime] = useState("");
  const [eligibleSemester, setEligibleSemester] = useState<Semester>("bca_sem1");
  const [addExamMessage, setAddExamMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedExam = useMemo(
    () => exams.find((x) => x.id === selectedExamId),
    [exams, selectedExamId]
  );

  const parseJsonResponse = async <T,>(res: Response): Promise<T> => {
    const raw = await res.text();
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`API returned non-JSON (status ${res.status}). Check API desktop app.`);
    }
  };

  const loadExams = async (authToken: string): Promise<void> => {
    const examRes = await fetch(`${apiUrl}/exams`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await parseJsonResponse<Exam[] | { message?: string }>(examRes);
    if (!examRes.ok || !Array.isArray(data)) {
      const message = !Array.isArray(data) ? data.message : "Failed to load exams";
      throw new Error(message ?? "Failed to load exams");
    }
    setExams(data);
  };

  const login = async (): Promise<void> => {
    setErrorMessage("");
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await parseJsonResponse<{ token?: string; message?: string }>(res);
    if (!res.ok || !data.token) {
      setErrorMessage(data.message ?? "Login failed");
      return;
    }
    setToken(data.token);
    try {
      await loadExams(data.token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not fetch exams");
    }
  };

  const addExam = async (): Promise<void> => {
    if (!newExamName.trim() || !newExamStartDateTime || !newExamEndDateTime) {
      setAddExamMessage("Please fill exam name, start time, and end time.");
      return;
    }
    const res = await fetch(`${apiUrl}/exams`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: newExamName.trim(),
        startsAt: new Date(newExamStartDateTime).toISOString(),
        endsAt: new Date(newExamEndDateTime).toISOString(),
        eligibleSemester
      })
    });
    if (res.ok) {
      setNewExamName("");
      setNewExamStartDateTime("");
      setNewExamEndDateTime("");
      setEligibleSemester("bca_sem1");
      await loadExams(token);
      setAddExamMessage("Exam created successfully.");
      return;
    }
    const errorData = (await parseJsonResponse<{ message?: string }>(res).catch(() => ({}))) as { message?: string };
    setAddExamMessage(errorData.message ?? "Failed to create exam.");
  };

  const loadAttempts = async (examId: string): Promise<void> => {
    setSelectedExamId(examId);
    setErrorMessage("");
    const res = await fetch(`${apiUrl}/exams/${examId}/attempts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await parseJsonResponse<AttemptSummary[] | { message?: string }>(res);
    if (!res.ok || !Array.isArray(data)) {
      setErrorMessage((!Array.isArray(data) ? data.message : "") || "Failed to load attempts");
      return;
    }
    setAttempts(data);
  };

  const loadEvents = async (attemptId: string): Promise<void> => {
    setSelectedAttempt(attemptId);
    setErrorMessage("");
    const res = await fetch(`${apiUrl}/attempts/${attemptId}/events`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await parseJsonResponse<{ events?: ProctorEvent[]; message?: string }>(res);
    if (!res.ok) {
      setErrorMessage(data.message ?? "Failed to load incident timeline");
      return;
    }
    setEvents(data.events ?? []);
  };

  const scorePercent = (score: number): number => Math.max(0, Math.min(100, (score / 10) * 100));

  if (!token) {
    return (
      <main className="container">
        <section className="card login-card">
          <h1>Anti-Cheat Admin Login</h1>
          <p className="helper">Sign in as teacher to create exams and review attempt integrity.</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
          <button onClick={login}>Login</button>
          {errorMessage && <p className="helper">{errorMessage}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>Teacher Dashboard</h1>
      {errorMessage && (
        <section className="card">
          <p className="helper">{errorMessage}</p>
        </section>
      )}
      <section className="card">
        <h2>Add Exam</h2>
        <p className="helper">Create a scheduled exam and assign one eligible semester group.</p>
        <input
          value={newExamName}
          onChange={(e) => setNewExamName(e.target.value)}
          placeholder="Exam name"
        />
        <input
          value={newExamStartDateTime}
          onChange={(e) => setNewExamStartDateTime(e.target.value)}
          type="datetime-local"
          placeholder="Exam start date/time"
        />
        <input
          value={newExamEndDateTime}
          onChange={(e) => setNewExamEndDateTime(e.target.value)}
          type="datetime-local"
          placeholder="Exam end date/time"
        />
        <select value={eligibleSemester} onChange={(e) => setEligibleSemester(e.target.value as Semester)}>
          <option value="bca_sem1">BCA Sem 1</option>
          <option value="bca_sem2">BCA Sem 2</option>
          <option value="bca_sem3">BCA Sem 3</option>
        </select>
        <button onClick={() => void addExam()}>Add Exam</button>
        {addExamMessage && <p className="helper">{addExamMessage}</p>}
      </section>
      <section className="card">
        <h2>Review Attempts</h2>
        <p className="helper">Pick an exam to see all student attempts and their honesty scores.</p>
        <select value={selectedExamId} onChange={(e) => void loadAttempts(e.target.value)}>
          <option value="">Choose...</option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name} ({exam.eligibleSemester.replace("bca_", "").toUpperCase()})
            </option>
          ))}
        </select>
      </section>

      {selectedExam && (
        <section className="card">
          <h2>Attempts for {selectedExam.name}</h2>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Start</th>
                <th>End</th>
                <th>Honesty Score</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td>{attempt.studentName}</td>
                  <td>{new Date(attempt.startedAt).toLocaleString()}</td>
                  <td>{attempt.endedAt ? new Date(attempt.endedAt).toLocaleString() : "-"}</td>
                  <td>
                    <div className="score-cell">
                      <div
                        className="score-ring"
                        style={{ "--score": `${scorePercent(attempt.honestyScore)}%` } as CSSProperties}
                      >
                        <span>{attempt.honestyScore.toFixed(1)}</span>
                      </div>
                      <small>/ 10</small>
                    </div>
                  </td>
                  <td>
                    <button onClick={() => void loadEvents(attempt.id)}>View Incident Timeline</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {selectedAttempt && (
        <section className="card">
          <h2>Incident Timeline</h2>
          <p className="helper">Suspicious events captured during the selected attempt.</p>
          <ul>
            {events.map((event) => (
              <li key={event.id}>
                <b>{event.eventType}</b> ({event.severity}) at {new Date(event.timestamp).toLocaleTimeString()}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
};
