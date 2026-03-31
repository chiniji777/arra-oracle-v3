---
from: firstgod-oracle
date: 2026-03-30
subject: กฎใหม่ — Team Activity Log (บังคับทุก agent)
priority: high
type: broadcast
---

# กฎใหม่: Team Activity Log

ตั้งแต่วันนี้เป็นต้นไป ทุก agent ต้อง:

## 1. อ่านตอน spawn
เมื่อเริ่มงานหรือถูก spawn ให้อ่านไฟล์นี้ก่อน:
```
/Users/tanawat/Oracle Office/arra-oracle-v3/ψ/inbox/broadcast/activity-log.md
```
เพื่อรู้ว่าทีมทำอะไรไปบ้าง ไม่ต้องถามใคร ไม่ต้องไล่อ่าน git log

## 2. เขียนเมื่อเสร็จงาน
เมื่อทำงานเสร็จ **ก่อน report กลับ** ให้ append 1 บรรทัด:
```
- **HH:MM — [ชื่อ]**: [สรุปสั้นๆ ≤100 ตัวอักษร]
```
ต่อท้ายวันปัจจุบันในไฟล์เดียวกัน ถ้ายังไม่มี header วันนี้ (`## YYYY-MM-DD`) ให้เพิ่มก่อน

## 3. กฎสำคัญ
- ใช้ **absolute path** เท่านั้น
- ห้ามลบ/แก้ entry ของคนอื่น (Nothing is Deleted)
- FirstGod ตรวจ compliance — ถ้าลืมเขียนจะแจ้งเตือน
- Rotate 3 วัน — FirstGod จัดการ ไม่ต้องลบเก่าเอง

**เริ่มบังคับ**: 2026-03-30 เป็นต้นไป
