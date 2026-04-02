# Trading ERP — Dispatch Brief for Athena

## From: FirstGod
## To: Athena (Assistant)
## Date: 2026-04-01
## Priority: HIGH

## Context

Nut ต้องการ Trading ERP ระบบบัญชีไทยครบ 100% — เดบิต/เครดิต, VAT 7%, WHT 18 ประเภท, ปิดงบประจำปีได้จริง

**Project Path:** `/Users/tanawat/Oracle Office/trading-erp/`
**Stack:** Bun + Hono.js + Drizzle ORM + libsql + React + Vite + TailwindCSS v4
**Research Reference:** `/Users/tanawat/Oracle Office/arra-oracle-v3/ψ/active/thai-accounting-erp-research.md`

## What's Done (Phase 1)

- 31-table Drizzle schema (accounting, contacts, products, inventory, sales, purchases, payments, tax)
- Journal engine: create/post/void/trial-balance/ledger (double-entry)
- 126 Thai COA accounts seeded (1xxx-5xxx)
- 18 WHT types seeded
- Backend routes: auth, COA, journal-entries, customers, suppliers, products, dashboard, inventory
- Frontend: Login, Dashboard, COA tree, Journal Entry, Customers, Suppliers pages
- Backend port 4001, Frontend port 7000

## Nut's Key Concern

> "ผมต้องการให้มันตรงกับระบบบัญชี 100% มีเดบิตเครดิตมี VAT อะไรเรียบร้อย มีโครงสร้างบันทึกบัญชีแบบถูกต้อง"

ทุก transaction ต้องผ่าน Journal Entry — ห้ามมี movement ที่ไม่ผ่านบัญชี

## Phases to Dispatch (Research → Skills → Build)

### Phase 3: Sales Cycle
**Research Topics:**
- Auto-journal template เมื่อ post Sales Invoice: DR 1120(AR) / CR 4100(Revenue) + CR 2120(Output VAT 7%)
- COGS journal: DR 5100(COGS) / CR 1140(Inventory) — weighted average cost
- Payment received: DR 1110(Bank) / CR 1120(AR)
- ถ้าลูกค้าหัก WHT: DR 1130(Prepaid WHT) + DR 1110(Bank) / CR 1120(AR)
- Quotation → Sales Order → Sales Invoice → Payment → Receipt flow
- Document numbering: QT-YYYY-NNNN, SO-YYYY-NNNN, INV-YYYY-NNNN
- Snapshot pattern: copy customer info into document header

**Worker Assignment:** Thor (Fullstack) หรือ Ember (Fullstack)
**Files to create/modify:**
- `src/services/sales.ts` — Business logic + auto-journal
- `src/routes/sales.ts` — CRUD + workflow endpoints
- `frontend/src/pages/QuotationsPage.tsx`
- `frontend/src/pages/SalesOrdersPage.tsx`
- `frontend/src/pages/SalesInvoicesPage.tsx`
- `frontend/src/pages/PaymentsReceivedPage.tsx`
- Update `src/server.ts` + `frontend/src/App.tsx`

### Phase 4: Purchase Cycle + WHT
**Research Topics:**
- Auto-journal เมื่อ post Purchase Invoice: DR 5200(Purchases)/DR 1130(Input VAT 7%) / CR 2110(AP)
- Stock receipt: DR 1140(Inventory) / CR 5200(Purchases) — weighted avg recalculation
- Payment made: DR 2110(AP) / CR 1110(Bank)
- WHT withholding: DR 2110(AP) / CR 1110(Bank) + CR 2130(WHT Payable)
- WHT Certificate (50 ทวิ) generation — ข้อมูลที่ต้องมี: ผู้จ่าย, ผู้รับ, ประเภทเงินได้, อัตราภาษี, จำนวนเงิน
- PO → Purchase Invoice → Payment + WHT flow

**Worker Assignment:** Hades (Backend) + Freya/Amaterasu (Frontend)
**Files to create/modify:**
- `src/services/purchases.ts` — Business logic + auto-journal
- `src/services/wht.ts` — WHT calculation + certificate
- `src/routes/purchases.ts` — CRUD + workflow
- `src/routes/wht.ts` — WHT certificates
- `frontend/src/pages/PurchaseOrdersPage.tsx`
- `frontend/src/pages/PurchaseInvoicesPage.tsx`
- `frontend/src/pages/PaymentsMadePage.tsx`
- `frontend/src/pages/WHTCertificatesPage.tsx`

### Phase 5: Tax & Banking
**Research Topics:**
- VAT Monthly: รวม Output VAT - Input VAT = Net VAT Payable (PP30)
- Settlement journal: DR 2120(Output VAT) / CR 1130(Input VAT) + CR 2140(VAT Payable)
- PND3 (บุคคลธรรมดา) / PND53 (นิติบุคคล) summary report
- Bank reconciliation: match bank_transactions กับ journal_entries
- Bank account management + opening balance

**Worker Assignment:** Hades (Backend) + Freya (Frontend)
**Files to create/modify:**
- `src/services/tax.ts` — VAT settlement + PND reports
- `src/services/banking.ts` — Bank reconciliation
- `src/routes/tax.ts` — VAT/WHT report endpoints
- `src/routes/banking.ts` — Bank account + reconciliation
- `frontend/src/pages/VATReportPage.tsx`
- `frontend/src/pages/WHTReportPage.tsx`
- `frontend/src/pages/BankingPage.tsx`

### Phase 6: Financial Reports
**Research Topics:**
- Balance Sheet from trial balance: Assets (1xxx) = Liabilities (2xxx) + Equity (3xxx)
- P&L from journal: Revenue (4xxx) - Expenses (5xxx) = Net Profit
- Cash Flow Statement: Operating/Investing/Financing activities from journal entries tagged with bank accounts
- Retained earnings calculation: Opening RE + Net Profit - Dividends = Closing RE
- Fiscal year closing: transfer P&L to Retained Earnings (3200)

**Worker Assignment:** Odin (Architecture + Analysis)
**Files to create/modify:**
- `src/services/reports.ts` — Financial statement generators
- `src/services/fiscal-close.ts` — Year-end closing
- `src/routes/reports.ts` — Report endpoints
- `frontend/src/pages/FinancialReportsPage.tsx`
- Update `frontend/src/pages/DashboardPage.tsx` with better KPIs

### Phase 7: Settings + Polish
**Worker Assignment:** Freya (Frontend) + Anubis (QA)
**Files to create/modify:**
- `frontend/src/pages/SettingsPage.tsx` — Company info, document sequences, fiscal periods
- `src/routes/settings.ts` — Settings CRUD
- Fix all TS errors, responsive design, loading states, error handling
- QA: test full accounting flow end-to-end

## Instructions for Athena

1. **Research Phase:** Dispatch 2-3 workers to research in parallel (แยกตามหัวข้อ):
   - Worker A: Research Sales + Purchase auto-journal templates (ต้องถูกต้อง 100% ตามมาตรฐานบัญชีไทย)
   - Worker B: Research VAT/WHT rules + financial reports (PP30, PND3/53, งบการเงิน)
   - Worker C: Research bank reconciliation + fiscal year closing

2. **Skills Phase:** เอา research มาถาม Saraswati → ขอ skills สำหรับ Trading ERP build

3. **Build Phase:** Dispatch workers ตาม Phase 3-7 พร้อม skills ที่ได้

4. **Key Rule:** ทุก transaction ต้องสร้าง Journal Entry — ledger คือ source of truth ห้ามมี money movement ที่ไม่ผ่านบัญชี

## Accounting Journal Templates (Reference)

```
Sales Invoice Post:
  DR 1120 ลูกหนี้การค้า (AR)        = total incl. VAT
  CR 4100 รายได้จากการขาย (Revenue)  = amount before VAT
  CR 2120 ภาษีขาย (Output VAT)      = amount * 7%

COGS (when invoice posted):
  DR 5100 ต้นทุนขาย (COGS)          = weighted avg cost * qty
  CR 1140 สินค้าคงเหลือ (Inventory)   = same amount

Purchase Invoice Post:
  DR 5200 ซื้อสินค้า (Purchases)      = amount before VAT
  DR 1130 ภาษีซื้อ (Input VAT)       = amount * 7%
  CR 2110 เจ้าหนี้การค้า (AP)        = total incl. VAT

Customer Payment:
  DR 1110 เงินฝากธนาคาร (Bank)      = amount received
  CR 1120 ลูกหนี้การค้า (AR)        = same

Customer Payment with WHT:
  DR 1110 เงินฝากธนาคาร (Bank)      = net after WHT
  DR 1131 ภาษีหัก ณ ที่จ่าย (Prepaid WHT) = WHT amount
  CR 1120 ลูกหนี้การค้า (AR)        = gross amount

Supplier Payment:
  DR 2110 เจ้าหนี้การค้า (AP)       = gross amount
  CR 1110 เงินฝากธนาคาร (Bank)      = net after WHT
  CR 2130 ภาษีหัก ณ ที่จ่ายค้างจ่าย (WHT Payable) = WHT amount

VAT Monthly Settlement (PP30):
  DR 2120 ภาษีขาย (Output VAT)      = total output
  CR 1130 ภาษีซื้อ (Input VAT)       = total input
  CR/DR 2140 ภาษีมูลค่าเพิ่มค้างจ่าย = net difference

Year-End Closing:
  DR 4xxx Revenue accounts           = total revenue
  CR 5xxx Expense accounts           = total expenses
  DR/CR 3200 กำไรสะสม (Retained Earnings) = net profit/loss
```
