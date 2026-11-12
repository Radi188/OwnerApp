# Frontend update: meter readings in one row (11 November 2026)

This file lists only what changed after `FRONTEND_UPDATE_2026-11-11.md`. Everything else is unchanged.

Base URL: `/api/v1`. All endpoints need the `Authorization: Bearer <token>` header.

**Status:** next deploy. These changes are not on the server yet.

| # | Change | Frontend work | Status |
|---|---|---|---|
| 1 | New `GET /utility-readings/grouped`: electricity and water in one row | **New table** for the meter readings page | Next deploy |
| 2 | A request body of `null` no longer fails; bad JSON returns a clean `400` | None | Next deploy |
| 3 | New `PATCH /utility-readings/bulk`: edit electricity and water together | **One edit form per row** | Next deploy |
| 4 | Editing a reading also updates the next one; photos only from uploads | Show the new `400` messages | Next deploy |

---

## 1. Meter readings: one row per room and date

`GET /utility-readings` is **unchanged**: it still returns one item per meter, so electricity and water are separate items. For the readings page, use the new endpoint instead:

```
GET /utility-readings/grouped?month=2026-11&propertyId=4
```

Permission: `view utility readings`

### How rows are made

- A row is **one room on one reading date**, with the electricity and water readings side by side.
- `POST /utility-readings/bulk` saves both meters with the same date, so they always share a row.
- Readings saved separately on **different days** appear as two rows, each with one meter set to `null`.
- If the same meter was read **twice on the same day** (entered by mistake), the second reading gets its own row. Nothing is hidden, so staff can see and delete the duplicate.

### Query parameters

All are optional.

| Param | Example | Meaning |
|---|---|---|
| `propertyId` | `4` | Only rooms of this property. Without it: every property the user can access. |
| `unitId` | `12` | One room's history |
| `month` | `2026-11` | Reading date in this month |
| `from`, `to` | `2026-11-01` | Reading date range, both days included |
| `billed` | `false` | `true` = already on an invoice, `false` = not billed yet |
| `search` | `A01`, `Dara` | Room code, the room's current tenant name, or note |
| `sort` | `-readingDate` | `-readingDate` (default, newest first), `readingDate`, `unitCode`, `-unitCode`. Room codes sort naturally: `A-2` before `A-10`. |
| `page`, `limit` | `1`, `100` | `limit` defaults to 100 (max 1000). Paging counts **rows**, not readings. |

A wrong value returns `400` with a message, for example `month must be YYYY-MM` or `sort must be one of -readingDate, readingDate, unitCode, -unitCode`.

### Response

```json
{
  "status": "success",
  "result": 2,
  "total": 16,
  "data": {
    "rows": [
      {
        "key": "12-2026-11-01",
        "unitId": 12,
        "readingDate": "2026-11-01",
        "unit": { "id": 12, "unitCode": "A01", "floorNumber": "1", "propertyId": 4 },
        "tenant": { "id": 31, "name": "Chun Mab", "phoneNumber": "012345678" },
        "electricity": {
          "id": 101,
          "previousReading": 1550,
          "currentReading": 1580,
          "usage": 30,
          "photo": "images/utility-readings/utility-elec-2-1761962100000.jpeg?exp=1794430800&sig=r9CZBQaGx1HbzYnUyqoN4qqagmjJ4LgfF-_SoZyi9a4",
          "note": null,
          "invoiceId": null,
          "invoice": null,
          "locked": false,
          "createdAt": "2026-11-01T02:15:00.000Z",
          "updatedAt": "2026-11-01T02:15:00.000Z"
        },
        "water": {
          "id": 102,
          "previousReading": 90,
          "currentReading": 92,
          "usage": 2,
          "photo": null,
          "note": null,
          "invoiceId": null,
          "invoice": null,
          "locked": false,
          "createdAt": "2026-11-01T02:15:00.000Z",
          "updatedAt": "2026-11-01T02:15:00.000Z"
        }
      },
      {
        "key": "14-2026-10-01",
        "unitId": 14,
        "readingDate": "2026-10-01",
        "unit": { "id": 14, "unitCode": "A03", "floorNumber": "1", "propertyId": 4 },
        "tenant": { "id": 27, "name": "Sok Dara", "phoneNumber": "098765432" },
        "electricity": {
          "id": 88,
          "previousReading": 900,
          "currentReading": 950,
          "usage": 50,
          "photo": null,
          "note": null,
          "invoiceId": 240,
          "invoice": { "id": 240, "invoiceNumber": "INV-2026-0240", "status": "paid" },
          "locked": true,
          "createdAt": "2026-10-01T03:00:00.000Z",
          "updatedAt": "2026-10-01T03:00:00.000Z"
        },
        "water": null
      }
    ]
  }
}
```

- `total` is the number of rows for these filters, across all pages. Use it for the pager.
- `key` is unique per row. Use it as the list key in your UI, not in API calls.
- `tenant`: the tenant who was billed for these readings. If the readings are not billed yet, it is the room's current tenant. It is `null` when the room is empty.
- `electricity` / `water` are `null` when that meter has no reading in this row.
- The readings are **numbers** here. The old list returns them as strings, such as `"1580.00"`.
- `locked: true` means the reading is on an invoice that isn't cancelled. The server refuses to edit or delete it, so disable those buttons and show "Already billed on invoice INV-…".
- `note` belongs to each meter. `/bulk` saves the same note on both.
- `photo` is a signed image path, the same format as every other photo in the API. Build the image URL the same way you already do.

### Edit, delete, add the missing meter

- **Edit a row:** `PATCH /utility-readings/bulk` edits both meters in one request. See section 3.
- **Delete:** `DELETE /utility-readings/:id` with `electricity.id` or `water.id`, one meter at a time.
- **Add the missing meter:** `POST /utility-readings` with `{ unitId, type: "water", currentReading, readingDate: <the row's readingDate> }`. Using the same date puts it in the same row. Offer this only on the room's **newest** row: the server takes the previous value from the meter's latest reading.

Reload the list after any change.

### Suggested table

```
Meter readings — November 2026          [Property ▾] [Not billed ▾] [Search room / tenant]

Room  Tenant     Date         ⚡ Electricity             💧 Water               Status
A01   Chun Mab   01 Nov 2026  1550 → 1580   30 kWh   90 → 92   2 m³        Not billed   [✏] [🗑]
A02   Sok Dara   01 Nov 2026  200 → 210     10 kWh   —  [+ Add water]      Not billed   [✏] [🗑]
A03   Sok Dara   01 Oct 2026  900 → 950     50 kWh   —                     🔒 INV-2026-0240
```

- Open the page on the current month (`month=YYYY-MM`) and the current property.
- Show "—" for a missing meter, with an "Add" link on the room's newest row while it isn't billed.
- ✏ opens one form with both meters and saves with `PATCH /utility-readings/bulk`. Disable a meter's fields when it is `locked`.
- 🗑 acts on one meter. A small menu ("Electricity" / "Water") works well.

---

## 2. Request bodies

Some POSTs take no input, such as `POST /tenants/:id/regenerate-qr` and `POST /tenants/:id/telegram-invite`. When the request sent the body `null` (for example `JSON.stringify(null)`), they failed with:

```
400  Unexpected token 'n', "null" is not valid JSON
```

After the next deploy:

- A `null` body is read as "no body", and the call works.
- Broken JSON returns `400 Request body is not valid JSON`, without a stack trace.
- A body that is only a number or a string returns `400 Request body must be a JSON object`.

No change is needed. If your request helper sends `JSON.stringify(data)` even when there is no data, it is still cleaner to send no body (or `{}`) for these calls.

---

## 3. Edit a row: both meters in one request

```
PATCH /utility-readings/bulk
```

Permission: `edit utility reading`

Send JSON, or form-data when there are photos. The field names match `POST /utility-readings/bulk`. Send only what changed:

| Field | Example | Meaning |
|---|---|---|
| `electricityId` | `101` | The row's `electricity.id`. Leave it out to edit only water. |
| `electricityReading` | `1585` | New electricity value |
| `waterId` | `102` | The row's `water.id`. Leave it out to edit only electricity. |
| `waterReading` | `93` | New water value |
| `readingDate` | `2026-11-02` | New date, applied to every meter sent, so the row stays together |
| `note` | `Re-read` | Applied to every meter sent. `""` clears it. |
| `electricityPhoto`, `waterPhoto` | file | New meter photo (form-data only). The old photo is deleted. |

```json
{ "electricityId": 101, "electricityReading": 1585, "waterId": 102, "waterReading": 93, "note": "Re-read" }
```

**Both meters are saved, or neither.** If one value is refused, nothing changes, and the message names the meter:

| Status | Message (examples) | When |
|---|---|---|
| `400` | `Water reading (40) cannot be less than previous reading (50)` | Below the value the reading starts from |
| `400` | `Electricity reading (1700) cannot be more than the next reading (1650 on 2026-12-01)` | Above the meter's next reading (see section 4) |
| `400` | `Electricity: cannot update a reading that has already been billed to an invoice` | The meter is `locked` |
| `400` | `Electricity: the next reading (2026-12-01) is already billed, so this value can no longer change` | The next reading is billed |
| `400` | `Water: the date cannot be after the next reading (2026-12-01)` | The new date jumps past the meter's next or previous reading |
| `400` | `Both readings must be for the same room` | `electricityId` and `waterId` belong to different rooms |
| `400` | `Reading 102 is not an electricity reading` | The ids are swapped |
| `400` | `Please provide electricityId and/or waterId` | Neither id was sent |
| `404` | `Electricity reading not found` | Wrong id, or another landlord's reading |

The response is `{ "readings": [ … ] }` with the saved readings, like `POST /bulk`. Reload the list afterwards.

**Form tips:** pre-fill it from the row. Send only the meters that are present: a row with `water: null` sends no `waterId`. Disable a meter's inputs when it is `locked`. If both are locked, hide ✏.

---

## 4. Changes to the existing edit and create endpoints

These apply to `PATCH /utility-readings/:id`, `POST /utility-readings` and `POST /utility-readings/bulk`.

**The next reading follows an edit.** Each reading starts where the meter's previous reading ended. Before, correcting October's value after November was recorded left November starting from the old October value, so November's usage, and its bill, was wrong. Now an edit also updates the next reading's start value and usage. Because of that:

- A new value can't be **higher than the meter's next reading** (`400`, see the table above).
- If the next reading is **already billed**, the value can't change any more (`400`). The note and photo can still change.
- `readingDate` can't move **before the previous reading or after the next reading** of that meter (`400`).

**Photos only come from uploads.** A `photo`, `electricityPhoto` or `waterPhoto` sent as text (a path or link) is now ignored. To change a photo, upload the file. Sending back the unchanged signed link, as some forms do, is harmless.

**Other changes:**

- `usage` sent in the body is ignored. The server always works it out from the readings.
- `readingDate` must be `YYYY-MM-DD`. A full ISO date-time is also accepted and cut to its date.
- `PATCH /utility-readings/abc` (an id that isn't a number) returns `404 Reading not found` instead of a `500`.
