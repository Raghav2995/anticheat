export type EventType =
  | "no_face"
  | "multi_face"
  | "suspicious_head_motion"
  | "window_focus_lost"
  | "context_switch_attempt"
  | "screen_share_interrupted";

export type Semester = "bca_sem1" | "bca_sem2" | "bca_sem3";

export interface ProctorEvent {
  id: string;
  attemptId: string;
  eventType: EventType;
  severity: "low" | "medium" | "high";
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AttemptSummary {
  id: string;
  examId: string;
  studentName: string;
  semester: Semester;
  startedAt: string;
  endedAt?: string;
  honestyScore: number;
}

export interface Exam {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  eligibleSemester: Semester;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  role: "teacher" | "student";
  name: string;
}
