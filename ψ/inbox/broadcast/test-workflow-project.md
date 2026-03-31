---
project: test-workflow-001
title: Landing Page Component Test
created: 2026-03-28T18:00:00+07:00
dispatcher: firstgod
status: active
---

# Test Project: Landing Page Component

## Objective
สร้าง simple landing page component เพื่อทดสอบ workflow coordination ระหว่าง assistant agents

## Tasks

### Task A → athena-oracle
สร้างไฟล์ `frontend/src/pages/Landing.tsx` — Hero section component
- Title: "Welcome to Oracle Network"
- Subtitle: "The decentralized AI assistant framework"
- Simple CSS module `Landing.module.css`
- เมื่อเสร็จ → `maw hey firstgod "Task A done — Landing hero created"`

### Task B → hermes-oracle
สร้างไฟล์ `frontend/src/pages/LandingFeatures.tsx` — Features section
- 3 feature cards: Speed, Security, Simplicity
- ใช้ CSS module `LandingFeatures.module.css`
- เมื่อเสร็จ → `maw hey firstgod "Task B done — Landing features created"`

## Success Criteria
- [ ] Both files created and compilable
- [ ] Both agents report back to firstgod
- [ ] No conflicts between the two tasks
