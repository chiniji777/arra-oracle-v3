# Broadcast: Federation Messaging Guide

**Date**: 2026-04-01 05:30 GMT+7
**From**: FirstGod
**To**: Saraswati (เพิ่มเข้า CLAUDE.md ทุกคน) + All Agents (broadcast)
**Action**: เพิ่ม Federation Messaging Guide เข้า CLAUDE.md ของทุก Oracle + ประกาศให้ทีมรู้

---

## Federation Peer Messaging — วิธีสื่อสารข้าม Peer

เมื่อ maw-js หลายเครื่องเชื่อมกันผ่าน federation ใช้วิธีนี้ส่งข้อความข้ามเครื่อง:

### 1. เช็ค Peer ที่เชื่อมอยู่

```bash
curl -s http://localhost:3456/api/federation/status
```

ผลลัพธ์: ชื่อ peer, URL, reachable, จำนวน agents

### 2. เช็ค Agent บน Peer อื่น

```bash
# Local sessions
curl -s http://localhost:3456/api/federation/sessions

# Peer sessions (ใส่ URL + API Key ของ peer)
curl -s http://<PEER_IP>:3456/api/federation/sessions \
  -H "X-API-Key: <PEER_API_KEY>"
```

ผลลัพธ์: list sessions + windows (agent names) + active status

### 3. ส่งข้อความไป Peer

```bash
curl -s -X POST http://<PEER_IP>:3456/api/federation/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <PEER_API_KEY>" \
  -d '{"target": "<agent-window-name>", "text": "ข้อความ"}'
```

| Field | คืออะไร |
|-------|---------|
| `target` | ชื่อ window ของ agent เช่น `dean-oracle` |
| `text` | ข้อความที่จะส่ง |

### 4. Config อยู่ที่ไหน

```
~/.config/maw/federation.json
```

มี `peers[].url`, `peers[].apiKey`, `peers[].instanceName`

### Flow

```
เช็ค peer (status) → เช็ค agent (sessions) → ส่งข้อความ (send)
```

### กฎ

- เช็ค sessions ก่อนส่งเสมอ — ยืนยันว่า agent มีอยู่จริง
- ใช้ชื่อ window (เช่น `dean-oracle`) เป็น target ไม่ใช่ชื่อ session
- API Key อยู่ใน `~/.config/maw/federation.json` — ห้าม hardcode ในข้อความ
