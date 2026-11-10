# Reports API — Frontend Guide

Base URL: `/api/v1/reports`

All endpoints are `GET`. Every one needs:

- **Auth header:** `Authorization: Bearer <token>`
- **Permission:** `view reports` (without it the API returns `403`)

Every successful response looks like this:

```json
{ "status": "success", "data": ... }
```

Errors look like this:

```json
{ "status": "fail", "message": "yearMonth must be in YYYY-MM format." }
```

---

## Things to know before you start

1. **Money values can come back as strings.** The database is Postgres and money columns are `DECIMAL`, so fields like `amount`, `totalAmount`, `cost` and `monthlyRent` often arrive as `"120.00"` instead of `120`. Always wrap them in `Number(...)` before doing math or formatting.
2. **Percentages come in two formats:**
   - `monthly-summary` and `occupancy-summary` send a string with a `%` sign: `"85.50%"`.
   - `occupancy-trend`, `category-breakdown` and `payment-methods` send a string with no `%` (`"85.50"`), or the number `0` when the total is 0.
   
   Use one helper for both: `parseFloat(String(v).replace('%', '')) || 0`.
3. **Date formats:**
   - `yearMonth`, and `from`/`to` on `occupancy-trend`: `YYYY-MM`
   - `from`/`to` on the other endpoints, and `asOf`: `YYYY-MM-DD`
   - Dates are parsed strictly, so `2026-1-5` is rejected. Always zero-pad.
4. **Leaving out `from`/`to` means the current month.** On endpoints that accept a date range, the default is the first to the last day of the current month. You must send both values or neither.
5. **Property scope applies to every report endpoint.** A report only ever includes properties the logged-in user is assigned to:

   | Query | Report covers |
   |---|---|
   | `?propertyId=1` | Property 1 |
   | `?propertyIds=1,2` or `?propertyIds=1&propertyIds=2` | Properties 1 and 2, combined in one report |
   | nothing, or `?propertyId=all` | Every property the user is assigned to |

   - A property the user isn't assigned to returns `403` ("You do not have access to property 3."). An ID that isn't a number returns `400`.
   - A user with no assigned properties gets empty reports.
   - Property assignments come from `POST /users/:id/properties` (the existing user ↔ property assignment, permission `assign properties`).
   - In the overview table below, every `propertyId?` parameter also accepts `propertyIds`.
6. **Missing names show as text, not `null`.** When a related record is missing, text fields are filled with `"N/A"`, `"Vacant"`, `"Property-Wide"` and so on. Display them as they are.

---

## Endpoint overview

| Endpoint | Purpose | Query params |
|---|---|---|
| [`/monthly-summary`](#1-monthly-summary) | KPI cards: revenue, expenses, profit, occupancy, collection rate | `propertyId?`, `yearMonth?` |
| [`/occupancy-summary`](#2-occupancy-summary) | Unit status breakdown (pie/donut) | `propertyId?` |
| [`/occupancy-trend`](#3-occupancy-trend) | Occupancy over months (line chart) | `from` **required**, `to` **required**, `propertyId?` |
| [`/category-breakdown`](#4-category-breakdown) | Income or expense by category (pie/bar) | `type?`, `from?`, `to?`, `propertyId?` |
| [`/unpaid-invoices`](#5-unpaid-invoices) | Aging buckets and unpaid invoice list | `asOf?`, `propertyId?` |
| [`/tenant-balances`](#6-tenant-balances) | Outstanding balance per tenant | `propertyId?` |
| [`/payment-methods`](#7-payment-methods) | Payments by method (pie) | `from?`, `to?`, `propertyId?` |
| [`/maintenance-summary`](#8-maintenance-summary) | Maintenance counts by status, costs and list | `from?`, `to?`, `propertyId?` |
| [`/rent-roll`](#9-rent-roll) | Every unit with its current tenant and rent (table) | `propertyId?` |
| [`/delinquency`](#10-delinquency) | Overdue invoices with days overdue (table) | `propertyId?` |
| [`/expenses`](#11-expenses) | Detailed expense list (table) | `from?`, `to?`, `propertyId?` |
| [`/dashboard`](#12-dashboard-client-monthly-report) | Client's monthly dashboard: income, expenses, net, occupancy per month | `from?`, `to?`, `propertyId?`, `format?`, `lang?` |
| [`/room-tenants`](#13-room--tenants) | Every room with its tenant, plus paid / owed / utility usage per month | `from?`, `to?`, `propertyId?`, `format?`, `lang?` |
| [`/expense-matrix`](#14-expense-matrix) | Expenses by category × month, plus detail lines | `from?`, `to?`, `propertyId?`, `hideEmpty?`, `format?`, `lang?` |
| [`/payment-status`](#16-payment-status) | Who has paid, who has paid part, who hasn't paid, and how much is left | `from?`, `to?`, `propertyId?`, `status?`, `overdueOnly?`, `format?`, `lang?` |
| [`/export`](#15-full-excel-export) | One `.xlsx` file with all of the above sheets | `from?`, `to?`, `propertyId?`, `hideEmpty?`, `lang?` |

---

## 1. Monthly Summary

`GET /api/v1/reports/monthly-summary?propertyId=1&yearMonth=2026-11`

| Param | Type | Default | Notes |
|---|---|---|---|
| `propertyId` | number | all properties | |
| `yearMonth` | `YYYY-MM` | current month | |

**Response**

```json
{
  "status": "success",
  "data": {
    "period": { "start": "2026-11-01", "end": "2026-11-30" },
    "occupancy": {
      "total": 20,
      "occupied": 17,
      "rate": "85.00%"
    },
    "finance": {
      "totalInvoiced": 4200,
      "invoiceIncome": 3800,
      "manualIncome": 150,
      "totalRevenue": 3950,
      "totalExpenses": 900,
      "profit": 3050,
      "collectionRate": "90.48%"
    }
  }
}
```

| Field | Meaning |
|---|---|
| `occupancy.occupied` | Units whose status is currently `Occupied`. This is a live count, not a count for the selected month. |
| `finance.totalInvoiced` | Total of invoices due in the month, excluding cancelled ones |
| `finance.invoiceIncome` | **Verified** payments received in the month (pending or rejected payments are not counted) |
| `finance.manualIncome` | Income transactions entered by hand in the month |
| `finance.totalRevenue` | `invoiceIncome + manualIncome` |
| `finance.totalExpenses` | Expense transactions in the month |
| `finance.profit` | `totalRevenue - totalExpenses` |
| `finance.collectionRate` | `invoiceIncome / totalInvoiced` |

> If no units exist, `occupancy.rate` is `"0%"`. If nothing was invoiced, `collectionRate` is `"0%"`.

---

## 2. Occupancy Summary

`GET /api/v1/reports/occupancy-summary?propertyId=1`

This shows the current state of all units and takes no date filter.

**Response:** an array that is ready to pass to a chart. The last item is the total, so filter it out before drawing a pie chart.

```json
{
  "status": "success",
  "data": [
    { "label": "Occupied",    "value": 17, "percentage": "85.00%" },
    { "label": "Available",   "value": 2,  "percentage": "10.00%" },
    { "label": "Reserved",    "value": 1,  "percentage": "5.00%" },
    { "label": "Maintenance", "value": 0,  "percentage": "0.00%" },
    { "label": "Total",       "value": 20, "percentage": "100%" }
  ]
}
```

```js
const slices = data.filter((d) => d.label !== 'Total');
```

---

## 3. Occupancy Trend

`GET /api/v1/reports/occupancy-trend?from=2026-01&to=2026-11&propertyId=1`

| Param | Type | Required | Notes |
|---|---|---|---|
| `from` | `YYYY-MM` | **yes** | |
| `to` | `YYYY-MM` | **yes** | Must be the same as or after `from` |
| `propertyId` | number | no | |

**Response:** one item per month, including both `from` and `to`.

```json
{
  "status": "success",
  "data": [
    { "month": "2026-01", "activeContracts": 15, "occupancyRate": "75.00" },
    { "month": "2026-02", "activeContracts": 16, "occupancyRate": "80.00" }
  ]
}
```

- `occupancyRate` has no `%` sign. It is `0` (a number) when there are no units.
- The rate is `activeContracts / current number of units`, so past months are measured against today's unit count.
- The server runs a separate query for each month, so keep the range reasonable. Up to about 24 months is fine.

---

## 4. Category Breakdown

`GET /api/v1/reports/category-breakdown?type=expense&from=2026-11-01&to=2026-11-30`

| Param | Type | Default | Notes |
|---|---|---|---|
| `type` | `income` \| `expense` | `expense` | Any value other than `income` is treated as `expense` |
| `from` / `to` | `YYYY-MM-DD` | current month | Send both or neither |
| `propertyId` | number | all | |

**Response**

```json
{
  "status": "success",
  "data": [
    { "category": "Repairs",   "amount": 450, "percentage": "50.00" },
    { "category": "Utilities", "amount": 300, "percentage": "33.33" },
    { "category": "unknown",   "amount": 150, "percentage": "16.67" }
  ]
}
```

- `"unknown"` collects transactions that have no category.
- If there is no data, the response is an empty array `[]`.

---

## 5. Unpaid Invoices

`GET /api/v1/reports/unpaid-invoices?asOf=2026-11-09&propertyId=1`

| Param | Type | Default | Notes |
|---|---|---|---|
| `asOf` | `YYYY-MM-DD` | today | The date used to calculate how overdue each invoice is |
| `propertyId` | number | all | |

"Unpaid" means any invoice whose status is not `paid` or `cancelled`, so `draft`, `sent`, `partial` and `overdue` are all included.

**Response**

```json
{
  "status": "success",
  "data": {
    "total": 2600,
    "averageOverdueDays": "18",
    "buckets": [
      { "range": "Current",    "amount": 1200, "count": 4 },
      { "range": "1-30 Days",  "amount": 800,  "count": 3 },
      { "range": "31-60 Days", "amount": 400,  "count": 1 },
      { "range": "61-90 Days", "amount": 200,  "count": 1 },
      { "range": "91+ Days",   "amount": 0,    "count": 0 }
    ],
    "details": [
      {
        "id": 101,
        "invoiceNumber": "INV-2026-0101",
        "dueDate": "2026-10-05",
        "amount": "200.00",
        "tenant": "Sok Dara",
        "unit": "A-101",
        "property": "Riverside"
      }
    ]
  }
}
```

- `amount` is the **full invoice total**, not the remaining balance. Partly paid invoices are counted at their full amount.
- `averageOverdueDays` is a string. Invoices that are not yet due count as 0 days.
- `details` is sorted by `dueDate`, oldest first.

> When `propertyId` has no invoices, you get the same shape: all 5 buckets set to 0 and an empty `details` array.

---

## 6. Tenant Balances

`GET /api/v1/reports/tenant-balances?propertyId=1`

**Response:** one row per tenant who has unpaid invoices.

```json
{
  "status": "success",
  "data": [
    {
      "tenantId": 7,
      "name": "Sok Dara",
      "balance": 450,
      "units": "A-101 (Riverside), B-202 (Riverside)"
    }
  ]
}
```

- `balance` is the sum of the full totals of unpaid invoices. Partial payments are not subtracted.
- `units` is one comma-separated string.
- The rows are not sorted. Sort them on the client, for example `balance` from highest to lowest.

---

## 7. Payment Methods

`GET /api/v1/reports/payment-methods?from=2026-11-01&to=2026-11-30`

| Param | Type | Default |
|---|---|---|
| `from` / `to` | `YYYY-MM-DD` | current month |
| `propertyId` | number | all |

**Response**

```json
{
  "status": "success",
  "data": [
    { "method": "khqr",          "amount": 2500, "percentage": "65.79" },
    { "method": "cash",          "amount": 1000, "percentage": "26.32" },
    { "method": "bank_transfer", "amount": 300,  "percentage": "7.89" }
  ]
}
```

`method` is one of `cash`, `bank_transfer`, `khqr` or `other`. Suggested labels:

```js
const METHOD_LABEL = { cash: 'Cash', bank_transfer: 'Bank Transfer', khqr: 'KHQR', other: 'Other' };
```

Only **verified** payments are counted. When there is no data, `data` is `[]`.

---

## 8. Maintenance Summary

`GET /api/v1/reports/maintenance-summary?from=2026-11-01&to=2026-11-30`

| Param | Type | Default | Notes |
|---|---|---|---|
| `from` / `to` | `YYYY-MM-DD` | current month | Filters on the date the request was **created** |
| `propertyId` | number | all | |

**Response**

```json
{
  "status": "success",
  "data": {
    "period": { "start": "2026-11-01", "end": "2026-11-30" },
    "statusCounts": [
      { "status": "pending",     "count": 3 },
      { "status": "assigned",    "count": 1 },
      { "status": "in_progress", "count": 2 },
      { "status": "completed",   "count": 5 },
      { "status": "cancelled",   "count": 0 }
    ],
    "totalCost": 820,
    "billableCost": 300,
    "details": [
      {
        "id": 55,
        "type": "plumbing",
        "description": "Leaking sink",
        "status": "completed",
        "cost": "120.00",
        "date": "2026-11-03T08:12:00.000Z",
        "unit": "A-101",
        "property": "Riverside"
      }
    ]
  }
}
```

- `statusCounts` always includes all 5 statuses, in the order shown.
- `billableCost` is the part of `totalCost` that can be charged to tenants.
- `details[].date` is a full ISO timestamp.

Both the `from` and `to` days are included in full.

---

## 9. Rent Roll

`GET /api/v1/reports/rent-roll?propertyId=1`

**Response:** one row per unit, sorted by unit id.

```json
{
  "status": "success",
  "data": [
    {
      "unitId": 1,
      "unitCode": "A-101",
      "propertyName": "Riverside",
      "status": "Occupied",
      "tenant": "Sok Dara",
      "phone": "012345678",
      "monthlyRent": "250.00",
      "startDate": "2026-01-01",
      "endDate": "2026-12-31"
    },
    {
      "unitId": 2,
      "unitCode": "A-102",
      "propertyName": "Riverside",
      "status": "Available",
      "tenant": "Vacant",
      "phone": "N/A",
      "monthlyRent": "230.00",
      "startDate": "N/A",
      "endDate": "N/A"
    }
  ]
}
```

- `status` is one of `Occupied`, `Available`, `Reserved` or `Maintenance`.
- Vacant units have `tenant: "Vacant"` and `"N/A"` for the phone and dates.
- `monthlyRent` is the rent from the active contract, or the unit's listed rent if there is no contract.

---

## 10. Delinquency

`GET /api/v1/reports/delinquency?propertyId=1`

This lists invoices with status `sent`, `partial` or `overdue`, sorted by `dueDate`, oldest first.

```json
{
  "status": "success",
  "data": [
    {
      "invoiceId": 101,
      "invoiceNumber": "INV-2026-0101",
      "unitCode": "A-101",
      "propertyName": "Riverside",
      "tenantName": "Sok Dara",
      "amount": "200.00",
      "dueDate": "2026-10-05",
      "daysOverdue": 35
    }
  ]
}
```

- `daysOverdue` is `0` for invoices that are not due yet. To show only overdue rows, filter with `row.daysOverdue > 0`.
- `amount` is the full invoice total.

---

## 11. Expenses

`GET /api/v1/reports/expenses?from=2026-11-01&to=2026-11-30&propertyId=1`

| Param | Type | Default |
|---|---|---|
| `from` / `to` | `YYYY-MM-DD` | current month |
| `propertyId` | number | all |

This returns expense transactions, newest first.

```json
{
  "status": "success",
  "data": [
    {
      "id": 88,
      "date": "2026-11-07",
      "category": "Repairs",
      "unitCode": "A-101",
      "propertyName": "Riverside",
      "description": "Replace door lock",
      "amount": "35.00"
    }
  ]
}
```

- A transaction that is not linked to a unit shows `unitCode: "Property-Wide"` and `propertyName: "All Properties"`. This happens even when the transaction does belong to a property.
- A transaction with no category shows `category: "Other"`.

---

## Error reference

| Status | When | Example message |
|---|---|---|
| 400 | `propertyId` is not a number | `Valid propertyId is required.` |
| 400 | Wrong `yearMonth` format | `yearMonth must be in YYYY-MM format.` |
| 400 | Wrong `from`/`to`/`asOf` format | `from must be in YYYY-MM-DD format.` |
| 400 | `to` is before `from` | `to must be after from.` |
| 400 | `occupancy-trend` is missing `from` or `to` | `from and to are required (YYYY-MM).` |
| 401 | Token is missing or invalid | |
| 403 | User does not have the `view reports` permission | |

---

## Example client (TypeScript)

```ts
import axios from 'axios';

const api = axios.create({ baseURL: '/api/v1/reports' });
api.interceptors.request.use((cfg) => {
  cfg.headers.Authorization = `Bearer ${localStorage.getItem('token')}`;
  return cfg;
});

// helpers
export const num = (v: unknown) => Number(v ?? 0) || 0;
export const pct = (v: unknown) => parseFloat(String(v ?? 0).replace('%', '')) || 0;
export const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? v : []);

type Range = { from?: string; to?: string; propertyId?: number };

export const reportsApi = {
  monthlySummary: (p: { propertyId?: number; yearMonth?: string }) =>
    api.get('/monthly-summary', { params: p }).then((r) => r.data.data),

  occupancySummary: (p: { propertyId?: number }) =>
    api.get('/occupancy-summary', { params: p }).then((r) => r.data.data),

  occupancyTrend: (p: { from: string; to: string; propertyId?: number }) =>
    api.get('/occupancy-trend', { params: p }).then((r) => r.data.data),

  categoryBreakdown: (p: Range & { type?: 'income' | 'expense' }) =>
    api.get('/category-breakdown', { params: p }).then((r) => r.data.data),

  unpaidInvoices: (p: { asOf?: string; propertyId?: number }) =>
    api.get('/unpaid-invoices', { params: p }).then((r) => {
      const d = r.data.data;
      return {
        total: num(d.total),
        averageOverdueDays: num(d.averageOverdueDays),
        buckets: arr(d.buckets),
        details: arr(d.details),
      };
    }),

  tenantBalances: (p: { propertyId?: number }) =>
    api.get('/tenant-balances', { params: p }).then((r) => r.data.data),

  paymentMethods: (p: Range) =>
    api.get('/payment-methods', { params: p }).then((r) => arr(r.data.data)),

  maintenanceSummary: (p: Range) =>
    api.get('/maintenance-summary', { params: p }).then((r) => r.data.data),

  rentRoll: (p: { propertyId?: number }) =>
    api.get('/rent-roll', { params: p }).then((r) => r.data.data),

  delinquency: (p: { propertyId?: number }) =>
    api.get('/delinquency', { params: p }).then((r) => r.data.data),

  expenses: (p: Range) =>
    api.get('/expenses', { params: p }).then((r) => r.data.data),
};
```

> Axios leaves out `undefined` params, so you can pass `{ propertyId: undefined }` to mean "all properties".


---

# Combined reports for several properties

When a report covers more than one property, the totals are **added together** and a breakdown per property is included:

| Report | Combined result | Per-property breakdown |
|---|---|---|
| `/dashboard` | `months` and `totals` for all properties together | `byProperty[]`: `{ property, months, totals }` for each property |
| `/room-tenants` | `rows` for every room in all properties (sorted by property, then room) and a combined `summary` | `byProperty[]`: `{ property, summary, monthlyRent, months[{ month, invoiced, paid, outstanding }] }` |
| `/expense-matrix` | One category × month matrix. `details[]` now includes `propertyId` and `propertyName`. | `byProperty[]`: `{ property, amounts, total }` |
| `/payment-status` | All rows (each has `propertyId` and `propertyName`) and a combined `summary` | `byProperty[]`: `{ property, summary }` |
| `/export` (Excel) | Every sheet covers all selected properties, and the subtitle lists their names | The Dashboard sheet adds a block per property. The Expenses sheet adds a row per property. The detail sheets have a Property column. |

Every report response also includes:
- `properties`: `[{ id, name }]`, the properties the report covers.
- `property`: `{ id, name }` when the report covers exactly one property, otherwise `null`. Keep using this for single-property screens.

`byProperty` is only included when the report covers 2 or more properties.

Suggested UI: a property picker with multi-select and an "All my properties" option. Show the combined cards or table first, then one tab or accordion per property from `byProperty`.

---

# Client monthly reports

These three reports match the client's Excel workbook (Dashboard, Room & Tenants and Mgt Expenses). They follow these rules:

- **Months use `YYYY-MM`.** `from` and `to` are both included. The range can be at most **36 months**.
- **Income is counted by billing month.** A payment counts toward the month its invoice is *for*, not the day the money arrived. For example, November rent paid on 2 Nov counts under November, and October rent paid on 3 Nov counts under October.
- **Only verified payments count.** Pending and rejected payments are ignored.
- **"Outstanding" or "owed"** is the whole invoice total minus payments: rent, utilities, fees and property charges, less any discount. Cancelled invoices are left out.
- **Money values are numbers** rounded to 2 decimals, not strings. **Percentages are numbers** with no `%` sign, for example `87.5`.
- **Excel download:** add `format=xlsx` to download the report as an Excel file instead of JSON. Add `lang=kh` for Khmer labels; the default is English.

### Downloading an Excel file

```ts
const res = await api.get('/room-tenants', {
  params: { propertyId, from: '2026-10', to: '2026-12', format: 'xlsx', lang: 'kh' },
  responseType: 'blob',
});
const name = /filename="(.+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? 'report.xlsx';
const url = URL.createObjectURL(res.data);
Object.assign(document.createElement('a'), { href: url, download: name }).click();
URL.revokeObjectURL(url);
```

The `Content-Disposition` header is readable from the browser.

---

## 12. Dashboard (client monthly report)

`GET /api/v1/reports/dashboard?propertyId=1&from=2026-10&to=2027-09`

| Param | Type | Default |
|---|---|---|
| `propertyId` | number | all properties |
| `from` | `YYYY-MM` | 11 months before `to` |
| `to` | `YYYY-MM` | current month |
| `format` | `xlsx` | JSON |
| `lang` | `kh` \| `en` | `en` (Excel only) |

```json
{
  "status": "success",
  "data": {
    "property": { "id": 1, "name": "7743 A&B" },
    "period": { "from": "2026-10", "to": "2026-11" },
    "months": [
      {
        "month": "2026-10",
        "invoiced": 640,
        "invoiceIncome": 355,
        "otherIncome": 0,
        "totalIncome": 355,
        "outstanding": 285,
        "expenses": 286.37,
        "netIncome": 68.63,
        "totalUnits": 16,
        "occupiedUnits": 14,
        "vacantUnits": 2,
        "occupancyRate": 87.5
      }
    ],
    "totals": {
      "invoiced": 640, "invoiceIncome": 355, "otherIncome": 0, "totalIncome": 355,
      "outstanding": 285, "expenses": 286.37, "netIncome": 68.63,
      "averageOccupancyRate": 87.5
    }
  }
}
```

| Field | Meaning | Client's row |
|---|---|---|
| `invoiced` | Total of invoices billed for that month | – |
| `invoiceIncome` | Verified payments on that month's invoices | ចំណូលពីជួល |
| `otherIncome` | Income transactions entered by hand in that month | – |
| `totalIncome` | `invoiceIncome + otherIncome` | – |
| `expenses` | Expense transactions in that month | ចំណាយប្រចាំខែ |
| `netIncome` | `totalIncome − expenses` | លុយនៅសល់ |
| `outstanding` | Amount still owed on that month's invoices | – |
| `totalUnits` | Number of units the property has now | ចំនួនបន្ទប់សរុប |
| `occupiedUnits` | Units that had a contract running at any point in that month | កំពុងជួល |
| `vacantUnits` | `totalUnits − occupiedUnits` | ទំនេរ |
| `occupancyRate` | `occupiedUnits / totalUnits × 100` | អត្រាកាន់កាប់ |

Suggested UI: a table with the metrics as rows and the months as columns, the same as the client's sheet, plus a line chart of `totalIncome`, `expenses` and `netIncome`.

---

## 13. Room & Tenants

`GET /api/v1/reports/room-tenants?propertyId=1&from=2026-10&to=2026-12`

| Param | Type | Default |
|---|---|---|
| `propertyId` | number | all properties (rows are sorted by property, then by room) |
| `from` | `YYYY-MM` | same as `to` |
| `to` | `YYYY-MM` | current month |
| `format` | `xlsx` | JSON |
| `lang` | `kh` \| `en` | `en` (Excel only) |

```json
{
  "status": "success",
  "data": {
    "property": { "id": 1, "name": "7743 A&B" },
    "period": { "from": "2026-10", "to": "2026-11", "months": ["2026-10", "2026-11"] },
    "summary": { "totalUnits": 16, "occupied": 14, "available": 2, "reserved": 0, "maintenance": 0 },
    "rows": [
      {
        "unitId": 1,
        "unitCode": "A01",
        "floor": "Ground",
        "propertyId": 1,
        "propertyName": "7743 A&B",
        "status": "Occupied",
        "monthlyRent": 60,
        "contractId": 1,
        "tenancyKind": "simple",
        "tenant": {
          "id": 1,
          "name": "Chun Mab",
          "gender": "male",
          "phoneNumber": "0712216892",
          "idNumber": "110613676(01)"
        },
        "moveInDate": "2026-10-16",
        "contractEndDate": null,
        "deposit": 60,
        "notes": null,
        "months": [
          {
            "month": "2026-10",
            "waterUsage": 3,
            "electricityUsage": 20,
            "invoiced": 45.47,
            "paid": 30,
            "outstanding": 15.47,
            "lastPaymentDate": "2026-10-16",
            "invoiceIds": [1],
            "invoiceStatuses": ["partial"]
          }
        ]
      }
    ],
    "totals": {
      "monthlyRent": 640,
      "deposit": 120,
      "months": [
        { "month": "2026-10", "waterUsage": 3, "electricityUsage": 20, "invoiced": 640, "paid": 355, "outstanding": 285 }
      ]
    }
  }
}
```

- `tenant` is `null` when nobody lives in the room. Show it as vacant.
- `tenancyKind` is `"contract"` for a formal contract, `"simple"` for a tenant who moved in without one, or `null` when the room is vacant.
- `status` is one of `Occupied`, `Available`, `Reserved` or `Maintenance`. In the client's Khmer terms: ជួល, ទំនេរ, កក់, ជួសជុល.
- `gender` is `male`, `female`, `other` or `null`.
- `months[].waterUsage` and `months[].electricityUsage` add up the meter readings taken during that month.
- `months[]` is always in the same order as `period.months`, so you can render the month columns by index.
- `invoiceIds` lets you link a cell to its invoice. A month can have more than one invoice, for example an extra maintenance invoice.

---

## 14. Expense matrix

`GET /api/v1/reports/expense-matrix?propertyId=1&from=2026-10&to=2027-09`

| Param | Type | Default |
|---|---|---|
| `propertyId` | number | all properties |
| `from` | `YYYY-MM` | 11 months before `to` |
| `to` | `YYYY-MM` | current month |
| `hideEmpty` | `true` | `false`: every expense category is listed, even if it has 0 spent |
| `format` | `xlsx` | JSON. The Excel file has a matrix sheet and a details sheet. |
| `lang` | `kh` \| `en` | `en` (Excel only) |

Categories are the ones the user created under `/api/v1/transaction-categories` with `type: "expense"`.

```json
{
  "status": "success",
  "data": {
    "property": { "id": 1, "name": "7743 A&B" },
    "period": { "from": "2026-10", "to": "2026-11", "months": ["2026-10", "2026-11"] },
    "rows": [
      { "categoryId": 1, "category": "ថ្លៃភ្លើង", "amounts": { "2026-10": 58.58, "2026-11": 40 }, "total": 98.58 },
      { "categoryId": 2, "category": "Pipes",   "amounts": { "2026-10": 62.75, "2026-11": 0 },  "total": 62.75 }
    ],
    "totals": { "amounts": { "2026-10": 121.33, "2026-11": 40 }, "total": 161.33 },
    "details": [
      {
        "id": 12,
        "date": "2026-10-27",
        "month": "2026-10",
        "categoryId": 2,
        "category": "Pipes",
        "vendor": "General supplier",
        "description": "Pipes & drains",
        "note": null,
        "unitCode": null,
        "amount": 62.75,
        "attachment": null
      }
    ]
  }
}
```

- `rows[].amounts` is keyed by month. Read it as `row.amounts[month]` for each month in `period.months`.
- `details` is sorted by date, oldest first.

---

## 15. Full Excel export

`GET /api/v1/reports/export?propertyId=1&from=2026-10&to=2026-10&lang=kh`

This downloads a single `.xlsx` file with 5 sheets: **Dashboard**, **Room & Tenants**, **Expenses**, **Expense Details** and **Payment Status**. It is the app's version of the client's monthly workbook.

| Param | Type | Default |
|---|---|---|
| `propertyId` | number | all properties |
| `from` | `YYYY-MM` | same as `to` |
| `to` | `YYYY-MM` | current month |
| `hideEmpty` | `true` | `false` |
| `lang` | `kh` \| `en` | `en` |

To get the same view as the client's file (every month since they started), set `from` to the first month and `to` to the current month.

---

## 16. Payment status

`GET /api/v1/reports/payment-status?propertyId=1&from=2026-10&to=2026-10&status=unpaid`

This answers "who has paid, who has paid part, who hasn't paid, and how much is left". It returns one row per invoice.

| Param | Type | Default |
|---|---|---|
| `propertyId` | number | all properties |
| `from` | `YYYY-MM` | same as `to` |
| `to` | `YYYY-MM` | current month |
| `status` | `paid` \| `partial` \| `unpaid` | all |
| `overdueOnly` | `true` | `false` |
| `format` | `xlsx` | JSON |
| `lang` | `kh` \| `en` | `en` (Excel only) |

```json
{
  "status": "success",
  "data": {
    "property": { "id": 1, "name": "7743 A&B" },
    "period": { "from": "2026-10", "to": "2026-10" },
    "filters": { "status": null, "overdueOnly": false },
    "summary": {
      "invoices": 15, "paid": 11, "partial": 2, "unpaid": 2,
      "invoiced": 640, "collected": 355, "pending": 20, "remaining": 285,
      "overdue": 3, "overdueAmount": 120, "collectionRate": 55.47
    },
    "rows": [
      {
        "invoiceId": 7,
        "invoiceNumber": "INV-202610-A02-000007",
        "month": "2026-10",
        "tenant": { "id": 4, "name": "Thon Narin", "phoneNumber": "011111111" },
        "unitId": 2,
        "unitCode": "A02",
        "propertyName": "7743 A&B",
        "dueDate": "2026-10-05",
        "invoiceStatus": "overdue",
        "invoiced": 60,
        "paid": 25,
        "pending": 0,
        "remaining": 35,
        "paymentStatus": "partial",
        "isOverdue": true,
        "daysOverdue": 5,
        "lastPaymentDate": "2026-10-03",
        "payments": [
          { "id": 31, "amount": 25, "paymentDate": "2026-10-03", "paymentMethod": "cash", "status": "verified", "note": null }
        ]
      }
    ]
  }
}
```

- **`paymentStatus`** says how much has been paid: `paid`, `partial` (some paid) or `unpaid` (nothing paid). Use it for the paid / partial / unpaid badge.
- **`isOverdue` and `daysOverdue`** say whether the due date has passed with money still owed. They're kept separate from `paymentStatus`, so an overdue invoice can still show as `partial`.
- **`pending`** is money the tenant has submitted that staff haven't verified yet. It is **not** counted in `paid`.
- **`summary`** covers the whole period, before the `status` and `overdueOnly` filters are applied. Use it for the counter cards.
- **Row order:** unpaid first, then partial, then paid. Within each group, the most overdue come first.
- **`payments`** lists every payment on that invoice, including pending and rejected ones, oldest first. Use it to show the payment history when a row is expanded.

---

# Payment tracking

## Balance fields on every invoice

These endpoints now add 7 fields to each invoice:

- `GET /invoices`
- `GET /invoices/:id`
- `GET /me/invoices`
- `GET /tenants/:id/invoices`

| Field | Type | Meaning |
|---|---|---|
| `paidAmount` | number | Total of **verified** payments |
| `pendingAmount` | number | Payments waiting for staff to verify them |
| `remainingAmount` | number | `totalAmount − paidAmount` (never below 0) |
| `paymentStatus` | `paid` \| `partial` \| `unpaid` \| `cancelled` | How much has been paid |
| `isOverdue` | boolean | The due date has passed and money is still owed |
| `daysOverdue` | number | 0 if not overdue |
| `lastPaymentDate` | `YYYY-MM-DD` \| null | Date of the latest verified payment |

The invoice's own `status` field still exists. It changes as follows:

| Situation | `status` |
|---|---|
| Fully paid | `paid` |
| Due date has passed and money is still owed | `overdue` |
| Some paid, due date not passed yet | `partial` |
| Nothing paid | `draft` or `sent` |

For "who paid what", show `paymentStatus` and `remainingAmount`. Use `status` only for the overdue warning.

## Recording payments

- **Partial payments:** send any amount up to what's left. Each payment is its own record.
- **Overpayment is blocked.** The API returns `400` if verified payments, plus pending payments, plus the new amount would come to more than the invoice total. Pending payments count toward the limit, so a tenant's submitted payment and a staff-recorded payment can't both cover the same money. Example messages:
  - `Payment exceeds the remaining balance. Maximum allowed is 30.00.`
  - `This invoice is already fully paid (or the remaining amount is waiting for verification).`
- **Pre-filling the amount:** a good default for the "amount" input is `remainingAmount − pendingAmount`.
- **Who verifies:** payments recorded by staff are verified straight away. Payments submitted by tenants are `pending` until `POST /payments/:id/verify` is called with `{ "status": "verified" | "rejected" }`.
- **`PATCH /payments/:id`** can change `amount`, `paymentDate`, `paymentMethod`, `transactionId`, `attachment` and `note`. It rejects a change of `status` (use `/verify`) or `invoiceId` (delete the payment and record a new one). The overpayment rule still applies.
- **`DELETE /payments/:id`** deletes the payment, and the invoice status is recalculated, for example from `paid` back to `partial`.
- **`GET /payments`** now includes `invoice.tenant` (`id`, `name`, `phoneNumber`).

---

# Related changes for the frontend

## New fields

| Where | Field | Type | Notes |
|---|---|---|---|
| Tenant (`POST`/`PATCH /api/v1/tenants`) | `gender` | `"male"` \| `"female"` \| `"other"` \| `null` | Not case-sensitive; an empty string is saved as `null` |
| Tenant | `idNumber` | string \| `null` | The ID card **number**. The existing `idCardPassport` field is still the uploaded photo. |
| Transaction (`POST`/`PATCH /api/v1/transactions`) | `vendor` | string \| `null` | Who was paid or who sold the item (អ្នកទទួល/អ្នកលក់) |

## Expenses and income: link to a property or a room

`POST /api/v1/transactions` and `PATCH /api/v1/transactions/:id` take `propertyId`, `unitId`, or neither:

| You send | Saved as |
|---|---|
| `unitId` (a room) | That room, **and its property is filled in automatically** |
| `propertyId` | A property-wide expense (`unitId: null`) |
| `unitId` + `propertyId` | That room. Returns `400` if the room isn't in that property. |
| neither | A property-wide expense on the user's current property |

- Room expenses appear in the property's reports, with the room shown in `unitCode`. Property-wide expenses show `unitCode: null`, or "Property-Wide" in `/reports/expenses`.
- To unlink an expense from its room, `PATCH` it with `unitId: null`. It stays on the same property.
- `GET /transactions`, `GET /transactions/:id` and every report only include properties assigned to the user. `GET /transactions` accepts `propertyId` and `propertyIds` in the same way as the reports.
- Old expenses that had a room but no property get the room's property from the migration `20261110190000-link-room-expenses-to-property.js`.

## Access control (no guessing IDs)

Users can only reach data for properties they're assigned to. A record that doesn't exist and a record in someone else's property get **the same answer**, so trying different IDs reveals nothing.

| Endpoint | Property not assigned / record not found |
|---|---|
| All `/reports/*` (`propertyId`, `propertyIds`) | `403` "You do not have access to this property." |
| `/properties/:propertyId/charges` | `403`, same message |
| `/transactions/:id` (get, update, delete) | `404` "No transaction found with that ID" |
| `POST/PATCH /transactions` with someone else's `propertyId` | `403` |
| `POST/PATCH /transactions` with someone else's `unitId` | `404` "Unit not found" |
| `/units/:id/move-in`, `/move-out`, `/move-out/preview` | `404` "Unit not found" |

### Access rules for every endpoint

All staff endpoints now follow the same rule: a user only sees and changes data of properties assigned to them. This covers properties, units, tenants, contracts, invoices, payments, maintenance, meter readings, occupants, announcements, templates, expenses, reports, dashboard, finance, form options and users.

- **Lists** only return records from the user's properties.
- **Getting, editing or deleting a record** from another property returns `404`, the same as a record that doesn't exist.
- **Creating or editing a record that points at another property** returns `403` or `404`. This applies to `propertyId`, `unitId`, `tenantId`, `contractId` and `invoiceId`.
- **Tenants** are visible when they're registered for one of the user's properties (`tenant.propertyId`, which is new), have a contract on one of the user's rooms, or were created by the user. When creating a tenant, `propertyId` defaults to the user's current property. Moving a tenant in sets it to the room's property.
- **Creating a property** automatically assigns it to the user who created it.
- **The user's current property** is only trusted if they're still assigned to it.
- **Tenant accounts** can't see any staff data. They use `/me/*`.

### User and role management

| Action | Rule |
|---|---|
| `GET /users` | Staff who share a property with you, staff not assigned to any property yet, and yourself |
| `PATCH /users/me` | Can't change `roleId` or `isActive`. Changing `settings.currentPropertyId` requires being assigned to that property. |
| Change a user's role, or create a user with a role | The role can only contain permissions you have yourself. You can't change your own role. |
| `POST /users/:id/properties` | You can only assign properties you're assigned to. The user's assignments to other properties are kept. |
| `POST /roles/:id/permissions` | You can only grant permissions you have, and not to your own role |
| Notifications (`sendToAll`, `userIds`) | Only staff and tenants of your properties |

API responses never include password hashes, reset codes, or other users' refresh tokens. List filters such as `?search=`, `?fields=` and `?password=` ignore those columns. `?limit` is capped at 1000.

### Images (private, signed links)

Images are no longer public. This covers ID cards, receipts, meter photos, logos and announcement images.

- **Signed automatically:** every image path in an API response comes back with a time-limited signature, for example `images/payments/x.jpeg?exp=1762790400&sig=…`. Use the value **exactly as returned**, as `${API_BASE}/${path}`. Don't build image URLs yourself from file names.
- **Without a valid link:** an unsigned, changed or expired link returns `403`.
- **Expiry:** links last about 6 hours (`IMAGE_URL_TTL_SECONDS`). Reloading the data gives fresh links. Within the same hour you get the same link, so browser caching still works.
- **Saving:** sending a signed link back, for example an unchanged photo field on `PATCH`, is fine. The server stores the clean path.
- **Who can view:** you only get links for images inside data you're allowed to see.

### Roles belong to each landlord

| Who | Can see | Can change |
|---|---|---|
| Staff | Core roles (Super Admin, Admin, Owner, Tenant), roles created by colleagues who share a property with them, and roles those colleagues hold | Only roles created by their colleagues **and** used only by their colleagues |
| Super Admin | All roles | All roles |

- **Core roles** can only be changed by a Super Admin, and their names are reserved. A landlord who wants different permissions creates their own role.
- **Other landlords' roles** return `404`, and can't be assigned to users.
- **Shared roles:** a role also used by another landlord's staff returns `403` when you try to edit it.

### Telegram groups

Each Telegram group now has a `propertyId` (`telegram_group_configs.property_id`). A broadcast with `sendToTelegram: true` only reaches the groups of the sender's properties. Groups without a property are only reached by a Super Admin. **Set `property_id` on your existing groups**, otherwise staff broadcasts won't reach them.

### CORS

Browsers can only call the API from `https://rental-management-system-eosin-nine.vercel.app`, plus any origins listed in `CORS_ORIGINS` (comma separated). When `NODE_ENV` isn't `production`, `http://localhost:*` is also allowed. Mobile apps and server-to-server calls send no Origin header and aren't affected.

### Telegram webhook

Set `TELEGRAM_WEBHOOK_SECRET` and run `node scripts/setup-telegram-webhook.js` again. After that, the webhook only accepts requests that carry Telegram's secret header.

## Property charges (internet, parking, ...)

A charge set on a property is added to **every tenant's invoice** in that property, the same way the electricity price is. Each one appears on the invoice as its own line, with `type: "charge"` and `description` set to the charge's name.

| Method | Endpoint | Permission | Body |
|---|---|---|---|
| GET | `/api/v1/properties/:propertyId/charges?active=true` | `view properties` | – |
| GET | `/api/v1/properties/:propertyId/charges/:id` | `view properties` | – |
| POST | `/api/v1/properties/:propertyId/charges` | `edit property` | `{ "name": "Internet", "amount": 5, "isActive": true }` |
| PATCH | `/api/v1/properties/:propertyId/charges/:id` | `edit property` | any of `name`, `amount`, `isActive` |
| DELETE | `/api/v1/properties/:propertyId/charges/:id` | `edit property` | – |

```json
{ "status": "success", "data": { "charge": { "id": 1, "propertyId": 1, "name": "Internet", "amount": "5.00", "isActive": true } } }
```

- `amount` must be 0 or more. In charge responses it comes back as a string, so wrap it in `Number(...)`.
- To pause a charge without deleting it, set `isActive: false`.
- Changes only apply to invoices created **after** the change. Invoices that already exist keep their own copy of each line.
- The per-unit fee fields (`parkingFee`, `internetFee`, ...) still work for charges that only some rooms pay. Don't set the same charge in both places, or the tenant will be billed twice.


---

# Move in / move out (without a contract)

Some landlords don't use contracts. They just put a tenant in a room and later record when the tenant leaves. Both ways of working are supported:

| Way of working | How to use it |
|---|---|
| **Formal contract** (existing) | `/api/v1/contracts`, unchanged: end date, terms, PDF, terminate. |
| **No contract** (new) | `POST /units/:id/move-in` and `POST /units/:id/move-out`. |

A move-in without a contract is stored as a contract with `kind: "simple"`. That means billing, invoices, payments, occupancy and all reports work the same for both kinds.

- To list only one kind, use `GET /api/v1/contracts?kind=simple` or `?kind=contract`. Every contract now includes a `kind` field.
- `POST /units/:id/move-out` works for **both** kinds. Use it whenever a tenant leaves, because it also produces the final bill.

## Property tenancy settings

Each property has 5 settings that control move-in, move-out and billing. They're edited from the dashboard with `PATCH /api/v1/properties/:id` (permission: `edit property`) and returned by `GET /properties/:id`.

| Field | Values | Default | What it does |
|---|---|---|---|
| `defaultBillingStrategy` | `anniversary` \| `unified` | `anniversary` | Billing type for new tenants. `anniversary`: a full month in advance from the move-in day, billed on that day every month. `unified`: everyone is billed on `billingDay`, and the first month is prorated. |
| `defaultMoveOutRentMode` | `prorated` \| `full` \| `none` | `prorated` | How to charge days after the paid month when a tenant leaves |
| `autoApplyDeposit` | boolean | `false` | Use the deposit to pay what's still owed at move-out |
| `dailyRateBasis` | `actual` \| `fixed30` | `actual` | Daily rate. `actual`: monthly price ÷ days in that month. `fixed30`: monthly price ÷ 30, never more than one month. Used for first-month proration and for extra days. |
| `refundUnusedDays` | boolean | `false` | Refund the unused days of the paid month when a tenant leaves early |

```json
PATCH /api/v1/properties/1
{ "defaultBillingStrategy": "anniversary", "defaultMoveOutRentMode": "prorated", "autoApplyDeposit": false, "dailyRateBasis": "actual", "refundUnusedDays": false }
```

An invalid value returns a validation error.

**Overrides:** staff can override a setting for a single move-in or move-out by sending the field in that request. The fields are `billingStrategy` on move-in, and `rentMode`, `applyDeposit` and `refundUnusedDays` on move-out. Pre-fill your forms from the property settings.

## Move in

`POST /api/v1/units/:id/move-in` (permission: `create contract`)

```json
{
  "tenantId": 12,
  "moveInDate": "2026-10-16",
  "monthlyRent": 60,
  "depositAmount": 60,
  "startReadings": { "electricity": 1520, "water": 88 },
  "note": "1st tenant, special offer"
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `tenantId` | yes | – | Create the tenant first with `POST /tenants` |
| `moveInDate` | no | today | `YYYY-MM-DD`. Past dates are fine for entering old records. A future date makes the room `Reserved`. |
| `monthlyRent` | no | the room's `monthlyRent` | |
| `depositAmount` | no | the room's `depositAmount` | |
| `startReadings` | no | – | Meter values on the move-in day. Electricity and water usage are then measured from these numbers. |
| `billingStrategy` | no | property's `defaultBillingStrategy` | `anniversary`: the tenant pays a **full month in advance from the move-in day** and is billed on that same day every month. No proration. `unified`: everyone is billed on the property's billing day, and the first month is prorated from the move-in day. |
| `createFirstInvoice` | no | `true` | Creates the first month's invoice right away, due on the move-in day. Record the payment against it when the tenant pays. |
| `note` | no | – | |

Response `201`: `{ "data": { "contract": { "id": 31, "kind": "simple", "billingStrategy": "anniversary", ... }, "firstInvoice": { "id": 40, "billingMonth": "2026-10", "dueDate": "2026-10-16", "totalAmount": "65.00", ... } } }`

`firstInvoice` is `null` when `createFirstInvoice` is `false`.

If a tenant moves in on the 29th–31st, they're billed on the last day of shorter months.

| Error | When |
|---|---|
| `409` | The room already has a tenant, or this tenant already lives in another room |
| `404` | The unit or tenant doesn't exist |

## Move out on any day

`POST /api/v1/units/:id/move-out/preview` (permission: `edit contract`)
`POST /api/v1/units/:id/move-out` (permission: `edit contract`)

Both take the same body. **`/preview` calculates everything and saves nothing.** Show the preview to staff, then call `/move-out` to confirm.

```json
{
  "moveOutDate": "2026-11-10",
  "finalReadings": { "electricity": 1580, "water": 92 },
  "rentMode": "prorated",
  "applyDeposit": true,
  "discount": 0,
  "note": "Moved back home"
}
```

| Field | Default | Notes |
|---|---|---|
| `moveOutDate` | today | `YYYY-MM-DD`. Cannot be in the future or before the move-in date. |
| `finalReadings` | – | Meter values on the day the tenant leaves. Usage since the last reading is billed on the final invoice. |
| `rentMode` | property's `defaultMoveOutRentMode` | Only used if the tenant stays **past** their paid month (see below) |
| `applyDeposit` | property's `autoApplyDeposit` | `true`: use the deposit to pay what the tenant still owes, oldest invoice first |
| `refundUnusedDays` | property's `refundUnusedDays` | `true`: refund the unused days of the paid month |
| `discount` | 0 | An extra discount on the final invoice |
| `note` | – | Saved on the tenancy |

### Rent when leaving: paid in advance

Each rent invoice pays for one month: from the move-in day with the default billing, or the calendar month with `unified` billing. The system finds the last day covered by the latest rent invoice. This is returned as `rent.paidThrough`.

| The tenant leaves… | Rent charged at move-out |
|---|---|
| **On or before `paidThrough`** (the normal case) | **Nothing.** The month is already paid. Unused days are refunded only if `refundUnusedDays` is on. |
| **After `paidThrough`** (the next month was never invoiced) | The extra days, according to `rentMode` |

| `rentMode` | Extra days after the paid month |
|---|---|
| `prorated` | Charge only the extra days, using the property's `dailyRateBasis` |
| `full` | Charge a full month for each calendar month the extra days fall in |
| `none` | Charge nothing |

The same rule applies to unit fees and property charges.

**Example.** A tenant moves in on 16 October and pays $65 ($60 rent + $5 internet). That pays them through 15 November. They leave on 10 November, using 30 kWh of electricity at $0.25.
- Rent: nothing more to pay, and no refund for 11–15 November.
- Final invoice: electricity $7.50.
- Deposit: $60, shown as refundable, or used to pay the $7.50 if `applyDeposit` is `true`.

### When `refundUnusedDays` is on

The unused days run from the day after the move-out date to `paidThrough`. They're worked out with the property's `dailyRateBasis`, for rent, unit fees and property charges. The credit is used in this order:
1. It lowers what is **still unpaid** on the invoice that covers those days.
2. Then it lowers the **final invoice**.
3. Anything left over is refunded (`credit.refund`, included in `refundDue`).

When the setting is off, `credit.enabled` is `false` and every credit amount is 0.

### What move-out does

1. Saves the final meter readings.
2. Creates a **final invoice**, if there's anything to charge (final utilities, extra rent days, or completed billable maintenance that hasn't been invoiced). Its `billingMonth` is the move-out date, it's due that same day, and its number looks like `INV-FINAL-202611-A01-000123`.
3. Ends the tenancy: `status: "Terminated"` and `endDate` set to the move-out date. The room becomes `Available`, and the tenant becomes `Moved Out` if they don't rent another room.
4. If `applyDeposit` is `true`, records "Deposit applied at move-out" payments (method `other`) on the unpaid invoices.

No new invoices are created for this tenancy after move-out.

### Response (`data.settlement`)

```json
{
  "preview": false,
  "contractId": 31,
  "kind": "simple",
  "tenant": { "id": 12, "name": "Chun Mab" },
  "unit": { "id": 1, "unitCode": "A01" },
  "moveInDate": "2026-10-16",
  "moveOutDate": "2026-11-10",
  "rentMode": "prorated",
  "settings": { "rentMode": "prorated", "applyDeposit": false, "refundUnusedDays": false, "dailyRateBasis": "actual" },
  "rent": {
    "paidThrough": "2026-11-15",
    "coveredByPaidPeriod": true,
    "extraFrom": null,
    "extraDays": 0,
    "charged": 0
  },
  "credit": { "enabled": false, "total": 0, "unusedDays": 0, "lines": [], "appliedToInvoice": 0, "appliedToFinalInvoice": 0, "refund": 0 },
  "finalInvoice": { "id": 41, "invoiceNumber": "INV-FINAL-202611-A01-000123", "totalAmount": "7.50", "remainingAmount": 7.5, "paymentStatus": "unpaid", "invoiceDetails": [ ... ] },
  "deposit": { "amount": 60, "applied": 0, "appliedTo": [], "refundable": 60 },
  "outstanding": 7.5,
  "unpaidInvoices": [ { "invoiceId": 41, "invoiceNumber": "INV-FINAL-202611-A01-000123", "billingMonth": "2026-11-10", "totalAmount": 7.5, "paidAmount": 0, "pendingAmount": 0, "remainingAmount": 7.5 } ],
  "refundDue": 0
}
```

| Field | Show it as |
|---|---|
| `rent.coveredByPaidPeriod` | `true`: the month was already paid, so no extra rent is charged |
| `rent.extraFrom` / `rent.extraDays` / `rent.charged` | Days after the paid month, and the rent charged for them |
| `outstanding` and `unpaidInvoices` | What the tenant **still owes**, after the deposit if it was applied |
| `deposit.refundable` | Deposit to return. When `applyDeposit` is `false`, this is the whole deposit, and staff decide. |
| `settings` | The values actually used: the property settings, plus any overrides from the request |
| `credit` | The refund for unused days. Only used when `refundUnusedDays` is on. |
| `refundDue` | Money to give back now: refunded unused days, plus the leftover deposit when `applyDeposit` is `true` |
| `finalInvoice` | `null` when there was nothing to charge |

### Meter readings when tenants change

When a tenant moves in, their invoices only use meter readings taken **after** they moved in. So the previous tenant's final reading is never billed to the new tenant, even when one leaves and the other moves in on the same day.

---

# Meter readings and billing

Electricity and water are billed **after** use. Rent is billed **in advance**. So each monthly invoice contains next month's rent and last month's usage.

**Every reading not billed yet gets billed.** Each reading remembers the invoice that billed it, in the new `invoiceId` field on `GET /utility-readings`, where `null` means not billed yet. When the next invoice is created:
- it adds up the usage of **all** readings not billed yet for that tenant, and
- shows them as one line per meter.

A reading recorded late, after that month's invoice was already created, is not lost. It goes on the next invoice.

```
Electricity (50 kWh * $0.25, 2 readings)   12.50
```

| Situation | What happens |
|---|---|
| Reading recorded after this month's invoice was created | Billed on the next invoice, together with the next reading |
| Invoice cancelled (`status: "cancelled"`) or deleted | Its readings are released and go on the next invoice |
| Property rate is $0 | The readings are still marked as used, so old usage never shows up on a later bill |
| Editing or deleting a reading | Blocked (`400`) only if it's on an invoice that isn't cancelled. Use `invoiceId` to disable the edit button. |
| Move-out | The final invoice includes every reading not billed yet, plus the final reading |

**Existing data:** the migration marks a reading as already billed if any invoice for the same room was created after the reading. This avoids suddenly billing months-old usage. Readings recorded after a room's last invoice stay unbilled and go on its next invoice.

---

# Invoice PDF (Khmer) and Telegram

When an invoice is created, either manually or by the billing cron, the tenant gets these on Telegram, if they've linked their Telegram account:

1. **A Khmer PDF invoice** as a document, with a short Khmer caption: property, room, invoice number, month, due date, total in USD and riel, and paid / remaining if partly paid.
2. **The property's KHQR image** as a photo, if one is set, so it can be scanned or saved into a banking app.

If the PDF can't be generated (for example, no browser on the server), a Khmer text message with the invoice lines is sent instead, followed by the KHQR.

The PDF includes: property name, address and phone; invoice number, month, issue date and due date; tenant name and phone, room and floor; every line in Khmer (electricity and water show the old and new meter readings, usage and unit price); subtotal, discount, total in USD and riel with the exchange rate; paid and remaining; payment status (បង់រួច / បង់បានខ្លះ / មិនទាន់បង់ / ហួសកំណត់); bank details; and the KHQR.

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/invoices/:id/pdf` | `view invoices` | Returns `application/pdf`. Opens in the browser; add `?download=true` to download instead. Only invoices from the user's properties. |
| POST | `/api/v1/invoices/:id/send-telegram` | `create invoice` | Sends the PDF and KHQR to the tenant again. `400` with a reason if the tenant hasn't linked Telegram. |
| GET | `/api/v1/me/invoices/:id/pdf` | logged-in tenant | The tenant's own invoices only |

Opening a PDF from the frontend (the request needs the token):

```ts
const res = await api.get(`/invoices/${id}/pdf`, { responseType: 'blob' });
window.open(URL.createObjectURL(res.data));
```

**Server requirements:** headless Chrome and a Khmer font. The Docker image installs `chromium`, `fonts-khmeros` and `fonts-noto-core`, and sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`. Outside Docker, install Chrome and a Khmer font, then set `PUPPETEER_EXECUTABLE_PATH` if Chrome isn't found automatically.
