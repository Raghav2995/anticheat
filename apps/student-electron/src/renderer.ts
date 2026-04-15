type EventType =
  | "no_face"
  | "multi_face"
  | "suspicious_head_motion"
  | "window_focus_lost"
  | "context_switch_attempt"
  | "screen_share_interrupted";

class HeadMotionTracker {
  private readonly buffer: Array<{ timestamp: number; yaw: number }> = [];

  addSample(yaw: number, timestamp = Date.now()): void {
    this.buffer.push({ yaw, timestamp });
    const keepAfter = timestamp - 120000;
    while (this.buffer.length > 0 && this.buffer[0].timestamp < keepAfter) {
      this.buffer.shift();
    }
  }

  isSuspicious(windowMs = 60000): boolean {
    const recent = this.buffer.filter((x) => x.timestamp >= Date.now() - windowMs);
    if (recent.length < 10) {
      return false;
    }
    let flips = 0;
    for (let i = 1; i < recent.length; i += 1) {
      const prev = recent[i - 1];
      const curr = recent[i];
      if ((prev.yaw <= -15 && curr.yaw >= 15) || (prev.yaw >= 15 && curr.yaw <= -15)) {
        flips += 1;
      }
    }
    return flips >= 12;
  }
}

const apiUrl = "http://localhost:4000";
const examSelect = document.getElementById("examSelect") as HTMLSelectElement;
const semesterSelect = document.getElementById("semesterSelect") as HTMLSelectElement;
const loadExamsBtn = document.getElementById("loadExamsBtn") as HTMLButtonElement;
const studentNameInput = document.getElementById("studentName") as HTMLInputElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
const logBox = document.getElementById("log") as HTMLDivElement;
const video = document.getElementById("webcam") as HTMLVideoElement;

let token = "";
let attemptId = "";
let monitoringStarted = false;
const headTracker = new HeadMotionTracker();
const eventQueue: EventType[] = [];
let loadedExams: Array<{ id: string; name: string; eligibleSemester: string }> = [];
let cameraStream: MediaStream | null = null;
let detectionIntervalId: number | null = null;
let noFaceStreak = 0;
let multiFaceStreak = 0;
let lastNoFaceEmitAt = 0;
let lastMultiFaceEmitAt = 0;
let mediapipeFaceCount: number | null = null;
let detectorStatusLogged = false;

const pushLog = (message: string): void => {
  const p = document.createElement("p");
  p.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  logBox.prepend(p);
};

const emitEvent = async (eventType: EventType, severity: "low" | "medium" | "high"): Promise<void> => {
  if (!attemptId || !token) {
    eventQueue.push(eventType);
    return;
  }
  await fetch(`${apiUrl}/attempts/${attemptId}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ eventType, severity })
  });
  pushLog(`Flag emitted: ${eventType}`);
};

const loginAsStudent = async (): Promise<void> => {
  if (token) {
    return;
  }
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "student1@college.edu", password: "student123" })
  });
  const data = await response.json();
  if (!response.ok || !data.token) {
    throw new Error(data.message ?? "Student login failed");
  }
  token = data.token;
};

const loadAvailableExams = async (): Promise<void> => {
  loadExamsBtn.disabled = true;
  try {
    await loginAsStudent();
    let response = await fetch(`${apiUrl}/exams/available`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 401) {
      token = "";
      await loginAsStudent();
      response = await fetch(`${apiUrl}/exams/available`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    }
    const data = (await response.json()) as Array<{ id: string; name: string; eligibleSemester: string }>;
    if (!response.ok) {
      const maybeError = data as unknown as { message?: string };
      throw new Error(maybeError.message ?? "Could not load exams");
    }
    loadedExams = data;
    renderExamOptions();
    pushLog(`Loaded ${data.length} exam(s)`);
  } finally {
    loadExamsBtn.disabled = false;
  }
};

const renderExamOptions = (): void => {
  const semester = semesterSelect.value;
  examSelect.innerHTML = '<option value="">Select exam...</option>';
  const filtered = semester ? loadedExams.filter((x) => x.eligibleSemester === semester) : loadedExams;
  for (const exam of filtered) {
    const option = document.createElement("option");
    option.value = exam.id;
    option.textContent = `${exam.name} (${exam.eligibleSemester.replace("bca_", "").toUpperCase()})`;
    examSelect.appendChild(option);
  }
  if (filtered.length > 0) {
    examSelect.value = filtered[0].id;
  }
  pushLog(`Showing ${filtered.length} exam(s) for selected semester`);
};

const startAttempt = async (): Promise<void> => {
  await loginAsStudent();
  if (!examSelect.value) {
    throw new Error("Select an exam first");
  }
  if (!semesterSelect.value) {
    throw new Error("Select your semester");
  }
  if (!studentNameInput.value.trim()) {
    throw new Error("Enter student name");
  }
  const response = await fetch(`${apiUrl}/attempts/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      examId: examSelect.value,
      studentName: studentNameInput.value.trim(),
      semester: semesterSelect.value
    })
  });
  const data = await response.json();
  if (!response.ok || !data.id) {
    throw new Error(data.message ?? "Failed to start attempt");
  }
  attemptId = data.id;
  pushLog(`Attempt started with id ${attemptId}`);
  while (eventQueue.length > 0) {
    const eventType = eventQueue.shift();
    if (eventType) {
      await emitEvent(eventType, "medium");
    }
  }
};

loadExamsBtn?.addEventListener("click", async () => {
  try {
    await loadAvailableExams();
  } catch (error) {
    loadExamsBtn.disabled = false;
    const message = error instanceof Error ? error.message : "Unknown error";
    pushLog(`Load exams failed: ${message}`);
  }
});

const startMonitoring = async (): Promise<void> => {
  if (monitoringStarted) {
    pushLog("Monitoring already running");
    return;
  }
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera API unavailable. Please restart app and allow camera permissions.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    cameraStream = stream;
    video.srcObject = stream;
    await video.play();
    monitoringStarted = true;
    pushLog("Camera stream started");
  } catch (error) {
    monitoringStarted = false;
    const message = error instanceof Error ? error.message : "Unknown camera error";
    throw new Error(`Camera start failed: ${message}`);
  }

  const FaceDetectorCtor = (window as unknown as { FaceDetector?: new () => { detect: (input: ImageBitmapSource) => Promise<Array<{ boundingBox: DOMRect }>> } }).FaceDetector;
  const detector = FaceDetectorCtor ? new FaceDetectorCtor() : null;
  let mediapipeDetector:
    | {
        send: (input: { image: HTMLVideoElement }) => Promise<void>;
      }
    | null = null;

  if (!detector) {
    const FaceDetectionCtor = (
      window as unknown as {
        FaceDetection?: new (config: {
          locateFile: (file: string) => string;
        }) => {
          setOptions: (options: Record<string, unknown>) => void;
          onResults: (
            cb: (results: { detections?: Array<{ boundingBox?: { width?: number; height?: number } }> }) => void
          ) => void;
          send: (input: { image: HTMLVideoElement }) => Promise<void>;
        };
      }
    ).FaceDetection;
    if (FaceDetectionCtor) {
      const mpDetector = new FaceDetectionCtor({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
      });
      mpDetector.setOptions({
        model: "short",
        minDetectionConfidence: 0.6
      });
      mpDetector.onResults((results: { detections?: Array<{ boundingBox?: { width?: number; height?: number } }> }) => {
        const detections = results.detections ?? [];
        mediapipeFaceCount = detections.length;
      });
      mediapipeDetector = mpDetector;
      pushLog("MediaPipe face detection fallback initialized.");
    } else {
      pushLog("Face detection unavailable. Native and MediaPipe detectors are missing.");
    }
  } else {
    pushLog("FaceDetector model initialized.");
  }

  detectionIntervalId = window.setInterval(async () => {
    try {
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }
      let faceCount = 1;
      let yawFromFace = 0;
      if (detector) {
        const detections = await detector.detect(video);
        const minFaceWidth = video.videoWidth * 0.12;
        const minFaceHeight = video.videoHeight * 0.12;
        const validFaces = detections.filter(
          (d) => d.boundingBox.width >= minFaceWidth && d.boundingBox.height >= minFaceHeight
        );
        faceCount = validFaces.length;
        if (faceCount > 0) {
          const box = validFaces[0].boundingBox;
          const centerX = box.x + box.width / 2;
          yawFromFace = ((centerX / Math.max(1, video.videoWidth)) - 0.5) * 60;
        }
      } else if (mediapipeDetector) {
        await mediapipeDetector.send({ image: video });
        if (mediapipeFaceCount === null) {
          if (!detectorStatusLogged) {
            pushLog("MediaPipe detector warming up...");
            detectorStatusLogged = true;
          }
          return;
        }
        faceCount = mediapipeFaceCount;
        if (!detectorStatusLogged) {
          pushLog("MediaPipe detector active.");
          detectorStatusLogged = true;
        }
      }

      const now = Date.now();
      if (detector || mediapipeDetector) {
        if (faceCount === 0) {
          noFaceStreak += 1;
        } else {
          noFaceStreak = 0;
        }

        if (faceCount > 1) {
          multiFaceStreak += 1;
        } else {
          multiFaceStreak = 0;
        }

        if (noFaceStreak >= 2 && now - lastNoFaceEmitAt > 10000) {
          await emitEvent("no_face", "high");
          lastNoFaceEmitAt = now;
        }
        if (multiFaceStreak >= 2 && now - lastMultiFaceEmitAt > 10000) {
          await emitEvent("multi_face", "high");
          lastMultiFaceEmitAt = now;
        }
        headTracker.addSample(yawFromFace);
        if (headTracker.isSuspicious()) {
          await emitEvent("suspicious_head_motion", "medium");
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown detection error";
      pushLog(`Detection loop error: ${message}`);
    }
  }, 3000);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      void emitEvent("context_switch_attempt", "medium");
    }
  });
};

semesterSelect?.addEventListener("change", () => {
  renderExamOptions();
});

void loadAvailableExams().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  pushLog(`Initial exam load failed: ${message}`);
});

startBtn?.addEventListener("click", async () => {
  try {
    pushLog("Starting monitoring...");
    await startMonitoring();
    await startAttempt();
    pushLog("Monitoring started successfully");
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    pushLog(`Start failed: ${message}`);
  }
});

const stopMonitoring = async (): Promise<void> => {
  if (detectionIntervalId !== null) {
    window.clearInterval(detectionIntervalId);
    detectionIntervalId = null;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  video.srcObject = null;
  monitoringStarted = false;
  noFaceStreak = 0;
  multiFaceStreak = 0;
  if (attemptId && token) {
    await fetch(`${apiUrl}/attempts/${attemptId}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  }
  pushLog("Monitoring stopped");
  startBtn.disabled = false;
  stopBtn.disabled = true;
};

stopBtn.disabled = true;
stopBtn?.addEventListener("click", async () => {
  try {
    await stopMonitoring();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    pushLog(`Stop failed: ${message}`);
  }
});

if (window.antiCheatBridge?.onFlag) {
  window.antiCheatBridge.onFlag((eventType) => {
    void emitEvent(eventType, "medium");
  });
}
