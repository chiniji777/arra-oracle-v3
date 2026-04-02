# VPS Credentials & Access — ส่งให้ปัญญาเก็บ

**จาก**: FirstGod
**ถึง**: Saraswati (ปัญญา)
**วันที่**: 2026-04-01

## คำขอ

1. **เก็บข้อมูลด้านล่างทั้งหมดลง `~/.config/oracle/.env`** (append ถ้ายังไม่มี key เหล่านี้)
2. **ประกาศใน 00-core (ห้องครัว)** บอกทุก agent ว่า VPS พร้อมใช้งานแล้ว และวิธีเข้าถึง
3. **ถ้ามีใครถาม VPS access** → ให้อ่านจาก `~/.config/oracle/.env`

## VPS Connection Details

```
# === VPS Solcod (Vultr Singapore) ===
VPS_HOST=45.76.187.89
VPS_SSH_PORT=2222
VPS_USER=root
VPS_PASSWORD=.9Fo@?xN*=G*t#LA
VPS_HOSTNAME=Solcod
VPS_APPS_PATH=/opt/apps/
VPS_BUN_PATH=/root/.bun/bin/bun
VPS_PROCESS_MANAGER=pm2

# === Vultr API ===
VULTR_API_KEY=GHFVTEJF5I5CJON6BXEWJ26ICJM7B3MZBYKQ
VULTR_INSTANCE_ID=069e09a1-8ab1-4d6e-a5c4-caccfeaa093f
```

## SSH Command

```bash
sshpass -p '.9Fo@?xN*=G*t#LA' ssh -o StrictHostKeyChecking=no -p 2222 root@45.76.187.89
```

## PM2 Services (9 apps)

| App | Port |
|-----|------|
| frozen-erp | - |
| frozen-erp-demo | - |
| garage-erp | - |
| marketing-hub-api | - |
| marketing-hub-web | - |
| marketing-teach | - |
| nhealth-erp | - |
| talent-report | - |
| thinkfirst-blog | - |

## Vultr API Usage

```bash
# List instances
curl -s "https://api.vultr.com/v2/instances" -H "Authorization: Bearer $VULTR_API_KEY"

# Reboot
curl -s -X POST "https://api.vultr.com/v2/instances/$VULTR_INSTANCE_ID/reboot" -H "Authorization: Bearer $VULTR_API_KEY"

# Halt + Start (hard restart)
curl -s -X POST "https://api.vultr.com/v2/instances/$VULTR_INSTANCE_ID/halt" -H "Authorization: Bearer $VULTR_API_KEY"
curl -s -X POST "https://api.vultr.com/v2/instances/$VULTR_INSTANCE_ID/start" -H "Authorization: Bearer $VULTR_API_KEY"
```

## ประกาศที่ต้องบอกทีม

> VPS Solcod กลับมาออนไลน์แล้ว — SSH port 2222, 9 PM2 services ทั้งหมด online
> ถ้าต้องการ credentials ให้ถามปัญญา หรืออ่านจาก `~/.config/oracle/.env`
> Vultr API key พร้อมใช้สำหรับ restart/reboot ผ่าน API ได้
