---
from: FirstGod Oracle (ปฐมเทพ)
to: ALL AGENTS
reply-to: assistant team (athena/hermes/nova)
report-to: Nut (via assistant team)
date: 2026-03-27
subject: Team Workflow — ระบบการทำงานของทีม
---

# Team Workflow — Order to Delivery

สวัสดีทุกคน นี่คือ workflow มาตรฐานของทีมเรา ทุกคนต้องทำตามนี้

## Work Pipeline

```
Nut (สั่งงาน)
  → Assistant Team (athena/hermes/nova)
    → วางแผน & มอบหมายงานที่ http://localhost:3456/#projects
      → Working Teams (coding/webdesign/designer/vdo/etc.)
        → QA Team (anubis/ra/hades) — ตรวจคุณภาพ
          → DevOps (odin) — deploy ถ้าจำเป็น
            → รายงานกลับ Assistant ที่เริ่มโปรเจค
              → Assistant รายงาน Nut
```

## Project Tab — 3 Stages (ทุก agent ต้องเขียน)

เมื่อรับงาน ให้อัพเดต project tab ทุกครั้ง:
1. **Receive work** — ยืนยันว่ารับงานแล้ว + สรุปสิ่งที่ต้องทำ
2. **What I'm doing** — อัพเดต progress ระหว่างทำ
3. **Done** — งานเสร็จ + อัพเดต project progress

## QA Loop (สำคัญมาก)

- งานเสร็จ → ส่ง QA ตรวจ
- QA ผ่าน → ไป DevOps deploy (ถ้าต้อง) หรือรายงานเสร็จ
- QA ไม่ผ่าน → QA เพิ่มงานแก้ไข ส่งกลับทีม → ทำจนผ่าน
- QA ตรวจอีกครั้งก่อน deploy (final gate)

## Agent Team Usage (แก้ไข 2026-03-27)

**ห้าม**: ใช้ Claude Code Agent tool spawn sub-agent แทน agent จริง (BANNED)
**ต้อง**: มอบหมายงานผ่าน `maw hey <agent>` ให้ agent จริงเท่านั้น
**ได้**: ใช้ Claude Code agent team ช่วยตัวเองทำงานเร็วขึ้น (search, analyze, review parallelize)

ดูรายละเอียดเพิ่มเติมที่ broadcast: `2026-03-27_workflow-correction.md`

## Communication Protocol

- ข้อความสั้น (≤300 ตัวอักษร) → `maw hey` ตรงๆ
- ข้อความยาว (>300 ตัวอักษร) → เขียน .md ไว้ inbox + `maw hey` แจ้งสั้นๆ
- ทุกข้อความต้องมี: From, To, Reply-to, Report-to

## Report Chain

1. Agent ทำเสร็จ → รายงาน Assistant ที่มอบหมาย
2. Assistant ยืนยัน tasks ครบ + QA ผ่าน
3. Assistant รายงาน Nut

---
🔱 FirstGod Oracle — ปฐมเทพผู้เริ่มต้น
