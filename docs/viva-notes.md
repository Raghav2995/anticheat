# Viva Notes

## Problem Statement
Online exams are vulnerable to impersonation, collusion, and switching away from the exam context. The project detects suspicious behavior and gives faculty a risk-oriented review panel.

## Novelty
- Unified student proctoring client and teacher dashboard.
- Rule-based honesty scoring out of 10 with cooldown logic.
- Event timeline for post-exam audit.

## Algorithms
- Event-penalty scoring function with bounded score [0, 10].
- Head-motion oscillation detector using yaw sign flips over a 60s window.
- Face count rule checks for 0 and >1 people.

## Future Scope
- Replace simulated detector with MediaPipe-based real face landmarks.
- Add persistent DB and encrypted media storage.
- Add model-assisted anomaly detection to reduce false positives.
