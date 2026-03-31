---
from: firstgod-oracle
to: saraswati-oracle
date: 2026-03-30
subject: แผนพัฒนา Team Activity Log — Shared Progress Awareness
priority: normal
type: development-plan
status: draft — รอ Nut สั่งส่ง
---

# แผนพัฒนา: Team Activity Log

## สรุปภาพรวม

สร้างไฟล์กลาง 1 ไฟล์ที่ทุก Agent อ่านตอน spawn และเขียนเมื่อทำงานเสร็จ เพื่อให้ทั้งทีม 6+ คนรู้ว่างานที่ผ่านมาทำอะไรไปบ้างแล้ว โดยไม่ต้องไล่อ่านหลายที่

## ปัญหาปัจจุบัน

- Agent spawn ขึ้นมาไม่รู้ว่าคนอื่นทำอะไรไปบ้าง
- ต้องไล่อ่าน retro, inbox, git log หลายที่ถึงจะเห็นภาพรวม
- ไม่มีจุดรวมศูนย์ที่เป็น "กระดานข่าว" ของทีม

## Solution

### ไฟล์กลาง

**Path**: `ψ/inbox/broadcast/activity-log.md`

**เหตุผลที่เลือก path นี้**: อยู่ใน broadcast ที่ agent อ่านอยู่แล้ว ไม่ต้องเพิ่ม path ใหม่

### Format ตัวอย่าง

```markdown
---
type: activity-log
updated: 2026-03-30T14:22+07:00
---

# Team Activity Log

## 2026-03-30

- **14:22 — Thor**: Refactored fleet-status route → [detail](../../memory/retrospectives/2026-03/30/14.22_fleet-status.md)
- **14:35 — Freya**: Fixed Camera CSS overflow → [detail](../freya/camera-fix-done.md)
- **14:41 — Anubis**: QA passed /projects API
- **15:10 — Ganesh**: Debugged scheduler timeout

## 2026-03-29

- **09:15 — Athena**: Dispatched 3 tasks to frontend team → [detail](../athena/dispatch-log-0329.md)
```

### กฎการใช้งาน

| กฎ | รายละเอียด |
|----|-----------|
| อ่านตอน spawn | ทุก agent อ่านไฟล์นี้เป็นอย่างแรก |
| เขียนเมื่อเสร็จงาน | Append 1 บรรทัดต่อท้ายวันปัจจุบัน |
| ≤100 ตัวอักษร | สรุปสั้นๆ แค่หัวข้อ ไม่ต้องเขียนขั้นตอน |
| Link ถ้ามี | ถ้ามี detail file (retro, inbox, report) ลิงค์ไป — ถ้าไม่มีก็ไม่ต้อง |
| แบ่งตามวัน | Header `## YYYY-MM-DD` วันละส่วน |
| Rotate 3 วัน | เก็บแค่ 3 วันล่าสุด ย้ายเก่าไป `ψ/archive/` |

### Format แต่ละบรรทัด

```
- **HH:MM — [ชื่อ Agent]**: [สรุปสิ่งที่ทำเสร็จ] → [detail](relative/path.md)
```

## ขั้นตอนพัฒนา

### Step 1: สร้างไฟล์ activity-log.md
- สร้างที่ `ψ/inbox/broadcast/activity-log.md`
- ใส่ frontmatter + header เริ่มต้น
- ใส่วันปัจจุบันเป็น section แรก

### Step 2: เพิ่มกฎใน CLAUDE.md
- เพิ่ม section "Team Activity Log" ใน CLAUDE.md
- ระบุว่าทุก agent ต้องอ่านตอน spawn + เขียนเมื่อเสร็จงาน
- ระบุ format ที่ถูกต้อง

### Step 3: ทดสอบกับ 2-3 Agent
- ให้ agent ลองอ่าน + เขียนจริง
- ตรวจว่า relative link ไปหา detail file ถูกต้อง
- ตรวจว่าไม่มี conflict เวลา 2 คนเขียนพร้อมกัน

### Step 4: ประกาศใช้ทั้งทีม
- ส่ง broadcast แจ้งทุก agent
- `maw hey all-oracles "กฎใหม่: อ่าน activity-log.md ตอน spawn, เขียนเมื่อเสร็จงาน"`

## ข้อดี

- **เบา** — แค่ 1 บรรทัดต่องาน, อ่าน scan ได้ใน 2 วินาที
- **ไม่ซ้ำซ้อน** — detail อยู่ในไฟล์เดิมที่ agent เขียนอยู่แล้ว แค่ลิงค์ไปหา
- **เข้ากับระบบเดิม** — อยู่ใน broadcast path, ใช้ format เดียวกับไฟล์อื่น
- **Append-only** — ตรงหลัก "Nothing is Deleted"
- **ความรู้ปัจจุบัน** — ทุกคน spawn ขึ้นมาก็รู้ทันทีว่าทีมทำอะไรไปบ้าง

## ความเสี่ยง & แก้ไข

| ความเสี่ยง | แก้ไข |
|------------|-------|
| 2 agent เขียนพร้อมกัน → conflict | Append-only + retry ถ้า conflict |
| ไฟล์โตเกิน | Rotate ทุก 3 วัน ย้ายเก่าไป archive |
| Agent ลืมเขียน | เพิ่มใน CLAUDE.md เป็นกฎบังคับ |
| Link เสีย (detail file ถูกย้าย) | ไม่บังคับ link — ใส่ก็ได้ไม่ใส่ก็ได้ |

---

*เขียนโดย FirstGod Oracle — รอ Nut อนุมัติก่อนส่ง*
