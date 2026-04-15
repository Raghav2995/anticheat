import bcrypt from "bcryptjs";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  AttemptSummary,
  AuthResponse,
  EventType,
  Exam,
  LoginRequest,
  ProctorEvent,
  Semester
} from "@anticheat/shared-types";
import { computeHonestyScore, getRiskBand } from "@anticheat/detection-engine";

const app = express();
app.use(cors());
app.use(express.json());

const jwtSecret = process.env.JWT_SECRET ?? "replace-in-production";
const port = Number(process.env.PORT ?? 4000);

type Role = "teacher" | "student";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}

interface AttemptRecord extends AttemptSummary {
  studentId: string;
}

const users: UserRecord[] = [];
const exams: Exam[] = [];
const attempts: AttemptRecord[] = [];
const events: ProctorEvent[] = [];

const seed = async (): Promise<void> => {
  if (users.length === 0) {
    const teacherPass = await bcrypt.hash("teacher123", 10);
    const studentPass = await bcrypt.hash("student123", 10);
    users.push(
      {
        id: uuidv4(),
        name: "Professor Sharma",
        email: "teacher@college.edu",
        passwordHash: teacherPass,
        role: "teacher"
      },
      {
        id: uuidv4(),
        name: "Rohan Singh",
        email: "student1@college.edu",
        passwordHash: studentPass,
        role: "student"
      }
    );
  }

  if (exams.length === 0) {
    exams.push(
      {
        id: uuidv4(),
        name: "Dummy C Fundamentals Quiz",
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
        eligibleSemester: "bca_sem1"
      },
      {
        id: uuidv4(),
        name: "Dummy DBMS Internal Test",
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
        eligibleSemester: "bca_sem2"
      },
      {
        id: uuidv4(),
        name: "Dummy BCA Major Project Viva",
        startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 50 * 60 * 60 * 1000).toISOString(),
        eligibleSemester: "bca_sem3"
      }
    );
  }
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(3)
});

const attemptStartSchema = z.object({
  examId: z.string(),
  studentName: z.string().min(2),
  semester: z.enum(["bca_sem1", "bca_sem2", "bca_sem3"]),
  studentId: z.string().optional()
});

const createExamSchema = z.object({
  name: z.string().min(3),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  eligibleSemester: z.enum(["bca_sem1", "bca_sem2", "bca_sem3"])
});

const eventSchema = z.object({
  eventType: z.custom<EventType>(),
  severity: z.enum(["low", "medium", "high"]),
  metadata: z.record(z.any()).optional()
});

interface AuthRequest extends Request {
  user?: { userId: string; role: Role; name: string };
}

const auth = (role?: Role) => (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ message: "Missing auth token" });
    return;
  }
  try {
    const payload = jwt.verify(token, jwtSecret) as AuthRequest["user"];
    if (!payload) {
      res.status(401).json({ message: "Invalid token payload" });
      return;
    }
    if (role && payload.role !== role) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: "Invalid auth token" });
  }
};

app.post("/auth/login", async (req: Request<{}, {}, LoginRequest>, res: Response<AuthResponse | { message: string }>) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const user = users.find((x) => x.email === parsed.data.email);
  if (!user) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }
  const token = jwt.sign(
    { userId: user.id, role: user.role, name: user.name },
    jwtSecret,
    { expiresIn: "10h" }
  );
  res.json({ token, role: user.role, name: user.name });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "anticheat-api" });
});

app.get("/exams", auth("teacher"), (_req, res) => {
  res.json(exams);
});

app.post("/exams", auth("teacher"), (req, res) => {
  const parsed = createExamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    res.status(400).json({ message: "Invalid start/end date" });
    return;
  }
  if (endsAt <= startsAt) {
    res.status(400).json({ message: "End time must be after start time" });
    return;
  }
  const exam: Exam = {
    id: uuidv4(),
    name: parsed.data.name,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    eligibleSemester: parsed.data.eligibleSemester
  };
  exams.push(exam);
  res.status(201).json(exam);
});

app.get("/exams/available", auth(), (_req, res) => {
  res.json(exams);
});

app.get("/exams/:id/attempts", auth("teacher"), (req, res) => {
  const rows = attempts.filter((x) => x.examId === req.params.id);
  res.json(rows.map(({ studentId: _studentId, ...rest }) => rest));
});

app.get("/attempts/:id/events", auth("teacher"), (req, res) => {
  const attemptEvents = events.filter((x) => x.attemptId === req.params.id);
  const score = computeHonestyScore(attemptEvents);
  res.json({ events: attemptEvents, score, riskBand: getRiskBand(score) });
});

app.post("/attempts/start", auth(), (req: AuthRequest, res) => {
  const parsed = attemptStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const exam = exams.find((x) => x.id === parsed.data.examId);
  if (!exam) {
    res.status(404).json({ message: "Exam not found" });
    return;
  }
  if (exam.eligibleSemester !== parsed.data.semester) {
    res.status(400).json({ message: "Selected semester is not eligible for this exam" });
    return;
  }
  const attempt: AttemptRecord = {
    id: uuidv4(),
    examId: parsed.data.examId,
    studentName: parsed.data.studentName,
    semester: parsed.data.semester as Semester,
    studentId: req.user?.userId ?? parsed.data.studentId ?? "unknown",
    startedAt: new Date().toISOString(),
    honestyScore: 10
  };
  attempts.push(attempt);
  res.status(201).json(attempt);
});

app.post("/attempts/:id/heartbeat", auth(), (req, res) => {
  const attempt = attempts.find((x) => x.id === req.params.id);
  if (!attempt) {
    res.status(404).json({ message: "Attempt not found" });
    return;
  }
  res.json({ status: "ok", serverTime: new Date().toISOString() });
});

app.post("/attempts/:id/events", auth(), (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const attempt = attempts.find((x) => x.id === req.params.id);
  if (!attempt) {
    res.status(404).json({ message: "Attempt not found" });
    return;
  }

  const row: ProctorEvent = {
    id: uuidv4(),
    attemptId: attempt.id,
    timestamp: new Date().toISOString(),
    eventType: parsed.data.eventType,
    severity: parsed.data.severity,
    metadata: parsed.data.metadata
  };
  events.push(row);
  attempt.honestyScore = computeHonestyScore(events.filter((x) => x.attemptId === attempt.id));
  res.status(201).json(row);
});

app.post("/attempts/:id/end", auth(), (req, res) => {
  const attempt = attempts.find((x) => x.id === req.params.id);
  if (!attempt) {
    res.status(404).json({ message: "Attempt not found" });
    return;
  }
  attempt.endedAt = new Date().toISOString();
  attempt.honestyScore = computeHonestyScore(events.filter((x) => x.attemptId === attempt.id));
  res.json(attempt);
});

seed().then(() => {
  app.listen(port, () => {
    console.log(`Anti-cheat API running on http://localhost:${port}`);
  });
});
