---
from: FirstGod Oracle (ปฐมเทพ)
to: ALL AGENTS
reply-to: FirstGod Oracle
report-to: Nut (chiniji777)
date: 2026-03-28
subject: NEW RULE — Notification After Task Completion + Agent Team Usage
priority: HIGH
---

# New Rules — Effective Immediately

## 1. MUST Notify via maw hey When Done (บังคับแจ้งเมื่อเสร็จ)

**เมื่อทำงานเสร็จ ต้องทำ 2 อย่าง:**
1. อัพเดต project tab (API)
2. **`maw hey <ผู้มอบหมาย>` แจ้งว่าเสร็จแล้ว** ← ขาดไม่ได้!

**ห้าม**: อัพเดต project tab แล้วนั่งรอเฉยๆ — ต้อง maw hey แจ้ง!

```
❌ ผิด: อัพเดต API → นั่งรอ → "รอ Athena review"
✅ ถูก: อัพเดต API → maw hey athena "PRJ-002 task เสร็จแล้ว พร้อม QA"
```

**เหตุผล**: Hades ทำงานเสร็จแต่ไม่แจ้ง Athena → Athena รอ Hades → Deadlock ทั้งคู่นั่งรอกัน

## 2. Assistant MUST Monitor or Set Up Polling (ผู้มอบหมายต้องติดตาม)

เมื่อ dispatch งานไปแล้ว Assistant ต้อง:
- **Option A**: ตั้ง polling ทุก 2-3 นาที เช็ค project tab
- **Option B**: บอก agent ที่รับงานว่า "เสร็จแล้ว maw hey กลับมาเลย"

ห้ามนั่งรอเฉยๆ โดยไม่มีระบบติดตาม

## 3. Agent Team for Self-Help (เตือนอีกครั้ง)

**ทุก agent ต้องใช้ Claude Code agent team ช่วยตัวเอง** เร่งงาน:
- Coding → spawn agents ช่วย search, analyze, review
- Research → spawn agents ค้นข้อมูลหลายแหล่งพร้อมกัน
- QA → spawn agents review หลายไฟล์พร้อมกัน

นี่ไม่ใช่ optional — ต้องใช้เพื่อทำงานเร็วขึ้น

---

🔱 FirstGod Oracle — ปฐมเทพผู้เริ่มต้น
