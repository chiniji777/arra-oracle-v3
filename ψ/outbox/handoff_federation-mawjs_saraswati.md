# Handoff: Federation maw-js — FirstGod → Saraswati

**Date**: 2026-04-01 02:05 GMT+7
**From**: FirstGod
**To**: Saraswati
**Action**: รวมงานที่ทำแล้ว commit push เข้า main

---

## สรุปสิ่งที่ทำ

สร้าง federation feature ให้ maw-js 2 ตัวเชื่อมต่อกันได้ผ่าน 6-digit pairing code แบ่งเป็น 2 ส่วน:

### 1. Plugin repo: `chiniji777/federation-maw-js`
- **repo**: https://github.com/chiniji777/federation-maw-js
- **pushed แล้ว** — ไม่ต้องทำอะไรเพิ่ม
- เป็น npm package ที่ maw-js import เข้าไปใช้
- Files:
  - `src/config.ts` — config read/write (`~/.config/maw/federation.json`)
  - `src/peers.ts` — pairing 6-digit, API key exchange, allowlist, session aggregation
  - `src/routes.ts` — `createFederationRoutes(app, deps)` Hono route factory
  - `src/index.ts` — re-export public API
  - `ui/NetworkView.tsx` — React component

### 2. maw-js integration (ยัง uncommitted — ต้อง commit + push)
**Repo**: `/private/tmp/maw-js`
**Branch**: `main`

#### Files ที่แก้:

**`src/server.ts`** — 2 changes:
1. เพิ่ม `import { createFederationRoutes } from "federation-maw-js"` (line 9)
2. เพิ่ม `createFederationRoutes(app, { listSessions, sendKeys, port, version })` ก่อน startServer()
3. เพิ่ม `GET /api/local-ips` endpoint — return local IPv4 addresses

**`office/src/App.tsx`** — 2 changes:
1. เพิ่ม `import { NetworkView } from "./components/NetworkView"`
2. เพิ่ม route block: `if (route === "network") { ... <NetworkView /> ... }`

**`office/src/components/StatusBar.tsx`** — 1 change:
1. เพิ่ม `{ href: "#network", label: "Network", id: "network" }` ใน NAV_ITEMS

**`office/src/components/NetworkView.tsx`** — NEW file:
- Copy จาก plugin + เพิ่ม Show/Hide IPs feature
- UI: Instance name, Pairing (generate/connect), Connected Peers, Agent Sharing toggles, Local IPs

**`src/config.ts`** — RESTORED:
- ถูก overwrite ระหว่าง dev ต้อง restore กลับเป็น maw-js version (มี buildCommand, configForDisplay)

#### Files ที่ไม่ต้อง commit (stubs จาก dev):
- `src/engine.status.ts`, `src/engine.teams.ts`, `src/commands/overview.ts`, `src/worktrees.ts`, `src/types.ts`, `src/lib/feed.ts` — เป็น source files ที่ extract จาก cli.ts bundle เพื่อให้ server รันได้แบบ standalone ถ้า main มีอยู่แล้วไม่ต้อง commit ซ้ำ

#### Dependencies เพิ่ม:
- `federation-maw-js` (local link) — อาจต้องเปลี่ยนเป็น npm publish หรือ git dependency

---

## วิธี commit

```bash
cd /private/tmp/maw-js
git status  # ดู changes

# Commit เฉพาะ federation integration files:
git add office/src/components/NetworkView.tsx
git add office/src/components/StatusBar.tsx
git add office/src/App.tsx
git add src/server.ts
git add src/config.ts

git commit -m "feat: federation — Network page with pairing, allowlist, IP sharing

- Add NetworkView.tsx: pairing UI, peer management, agent allowlist toggles, show/hide local IPs
- Add #network route in App.tsx + StatusBar nav link
- Add createFederationRoutes() integration in server.ts
- Add GET /api/local-ips endpoint
- Restore config.ts with buildCommand/configForDisplay exports"

git push origin main
```

## Verified
- All federation API endpoints tested via curl (discover, pair, allowlist, peers, instance-name, local-ips)
- Frontend build passes (`bunx vite build` — 1.28MB)
- Network page renders correctly with all sections
