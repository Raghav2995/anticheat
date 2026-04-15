# Electron Anti-Cheat (BCA Major Project)

Monorepo containing:
- Student exam client (`apps/student-electron`)
- Teacher admin dashboard (`apps/admin-web`)
- Backend API (`apps/api`)
- Shared domain models (`packages/shared-types`)
- Detection/scoring engine (`packages/detection-engine`)

## Quick Start

1. Install dependencies:
   - `npm install`
2. Start API:
   - `npm run dev:api`
3. Start admin panel:
   - `npm run dev:admin`
4. Start student client:
   - `npm run dev:student`

## Demo Accounts

- Teacher: `teacher@college.edu` / `teacher123`
- Student: `student1@college.edu` / `student123`

## Core Features

- Face checks:
  - no face -> `no_face` event
  - multiple faces -> `multi_face` event
- Head motion suspiciousness detector (`suspicious_head_motion`)
- Focus/context switch flags:
  - `window_focus_lost`
  - `context_switch_attempt`
- Honesty score out of 10 with cooldown-aware penalties
- Teacher dashboard:
  - login
  - select exam
  - view attempts and honesty score
  - inspect attempt event timeline

## Notes

The current MVP uses in-memory backend storage with SQL migration scripts included for a DB-backed upgrade path.
