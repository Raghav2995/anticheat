# Test Report (MVP)

## Unit-Level Checks
- Detection penalties and cooldown behavior validated via manual event sequences.
- Risk bands verified:
  - score >= 8 => low
  - score 5-7.9 => medium
  - score < 5 => high

## Integration Checks
- Teacher login succeeds with seeded credentials.
- Teacher can fetch exams and attempts.
- Student app can start attempt and post events.
- Honesty score updates after event ingestion and exam end.

## Simulated Scenario Evidence
- No face detected -> `no_face` generated.
- Multiple face detected -> `multi_face` generated.
- Prolonged oscillating yaw -> `suspicious_head_motion` generated.
- Window blur and visibility changes -> focus/context switch events generated.

## Known Gaps
- Face detection currently uses simulation fallback values rather than production-grade CV model.
- Persistent DB integration is prepared via migration script but runtime store is in-memory for demo speed.
- Screen-share interruption flag is placeholder and should be wired to desktop-capture session checks in next iteration.
