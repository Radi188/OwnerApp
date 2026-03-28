# Property API (PMS) - Frontend API Documentation

## Overview
Base URL: `/api/v1`

All successful responses include `status: "success"`. Errors in production include `status` and `message`.

## Authentication
All protected endpoints require:
- `Authorization: Bearer <accessToken>`

Login requires:
- Header: `x-platform` (required). Use `mobile` for mobile clients.
- If `x-platform=mobile`, also provide `deviceId` in body or `x-device-id` header.

Language:
- Optional query param `?lang=kh` for Khmer error messages (default `en`).

### POST /auth/login
Auth: Public

Headers:
- `x-platform` (required)
- `x-device-id` (required if `x-platform=mobile` and not in body)

Body fields:
- `username` (string, required)
- `password` (string, required)
- `deviceId` (string, required if `x-platform=mobile`)
- `fcmToken` (string, optional)

Response:
```
{
  "status": "success",
  "accessToken": "...",
  "refreshToken": "...",
  "data": {
    "user": {
      "id": 1,
      "username": "...",
      "roleId": 2,
      "isActive": true,
      "isBiometrics": false,
      "mustChangePassword": false,
      "tenant": null,
      "role": {
        "id": 2,
        "name": "...",
        "description": "...",
        "permissions": {
          "type": {
            "feature": [ { "name": "...", "description": "...", "scope": "...", "index": 0 } ]
          }
        }
      },
      "settings": { "language": "en", "theme": "light", "notify": true, "deviceId": "..." },
      "isTelegramLinked": false
    }
  }
}
```

### POST /auth/refresh
Auth: Public

Body fields:
- `refreshToken` (string, required)

Response:
```
{ "status": "success", "accessToken": "...", "refreshToken": "..." }
```

### POST /auth/logout
Auth: Protected

Response:
```
{ "status": "success", "message": "Logged out successfully" }
```

### POST /auth/change-password
Auth: Protected

Body fields:
- `currentPassword` (string, required)
- `newPassword` (string, required)
- `confirmPassword` (string, required)

Response:
```
{ "status": "success", "message": "Password changed successfully." }
```

### POST /auth/forgot-password
Auth: Public

Body fields:
- `identifier` (string, required) - username or email

Response (always success even if user not found):
```
{ "status": "success", "message": "If the account exists, an OTP was sent to the registered email.", "data": { "email": null } }
```

### POST /auth/verify-otp
Auth: Public

Body fields:
- `identifier` (string, required)
- `otp` (string, required)

Response:
```
{ "status": "success", "message": "OTP verified successfully.", "resetToken": "..." }
```

### POST /auth/reset-password
Auth: Public

Body fields:
- `identifier` (string, required)
- `resetToken` (string, required)
- `newPassword` (string, required)
- `confirmPassword` (string, required)

Response:
```
{ "status": "success", "message": "Password reset successfully." }
```

### DELETE /auth/users/:userId/device
Auth: Protected
Permission: `edit user`

Response:
```
{ "status": "success", "message": "User device cleared and user logged out.", "data": { "userId": 1, "deviceId": null, "fcmToken": null, "notify": true } }
```

## Common Query Parameters (List Endpoints)
These apply to most GET list endpoints using `handlerFactory`.

- `page` (default 1)
- `limit` (default 100)
- `sort` (comma-separated, prefix `-` for desc; use `default` to skip sorting)
- `fields` (comma-separated field list)
- `search` (full-text iLike on all string fields)
- `meta=true` (include meta fields like `createdBy`, `updatedBy`, `deletedAt`)
- `from`, `to` (date range, defaults to model date or createdAt)
- `period` (`lastMonth`, `last3Months`, `last6Months`, `lastYear`)
- `yearMonth` (`YYYY-MM`, filters `createdAt`)
- Advanced filters: `amount[gte]=100`, `amount[lte]=500` (supports `gte`, `gt`, `lte`, `lt`)

List response shape:
```
{
  "status": "success",
  "result": 10,
  "total": 230,
  "data": { "<pluralModelName>": [ ... ] }
}
```

## Error Response (Production)
```
{ "status": "error", "message": "..." }
```

## Users & Roles

### GET /users
Auth: Protected
Returns only `type=system_user` users.

### POST /users
Auth: Protected

Body fields:
- `username` (string, required)
- `password` (string, required)
- `confirmPassword` (string, required)
- `roleId` (number, required)

### GET /users/:id
Auth: Protected

### PATCH /users/:id
Auth: Protected

Body fields (any):
- `username` (string)
- `roleId` (number)
- `isActive` (boolean)
- `settings` (object: `language`, `theme`, `notify`, `deviceId`, `fcmToken`, `isBiometrics`)

### DELETE /users/:id
Auth: Protected
Only `type=system_user` can be deleted.

### GET /users/me
Auth: Protected
Returns the logged-in user with settings, role, and tenant.

### PATCH /users/me
Auth: Protected
Same fields as PATCH `/users/:id`.

### GET /roles
Auth: Protected
Permission: `view roles`

### POST /roles
Auth: Protected
Permission: `create role`

Body fields:
- `name` (string, required)
- `description` (string, optional)

### GET /roles/:id
Auth: Protected

### PATCH /roles/:id
Auth: Protected
Permission: `edit role`

### DELETE /roles/:id
Auth: Protected
Permission: `delete role`

### POST /roles/:roleId/permissions
Auth: Protected
Permission: `assign permission`

Body fields:
- `permissionIds` (array of numbers, required)

### GET /permissions
Auth: Protected

### POST /permissions
Auth: Protected

Body fields:
- `feature` (string, required)
- `name` (string, required, unique)
- `description` (string, optional)
- `scope` (string, optional)
- `type` (string, optional)
- `index` (number, optional)

### GET /permissions/grouped
Auth: Protected
Returns permissions grouped by `type` and `feature`.

### GET /permissions/:id
Auth: Protected

### PATCH /permissions/:id
Auth: Protected

### DELETE /permissions/:id
Auth: Protected

## System Config

### GET /system-config
Auth: Protected
Permission: `view system config`

### PATCH /system-config
Auth: Protected
Permission: `edit system config`

Body fields (any):
- `startClockIn`, `allowLate`, `startClockOut`, `allowEarlyLeave`, `startBreakClockIn`, `startBreakClockOut`, `otStartTime`

## Form Options

### GET /form-options/pms
Auth: Protected
Returns `{ properties: [{id,name}], units: [{id,unitCode,propertyId}], roles: [{id,name}] }`.

## Properties & Units

### GET /properties
Auth: Protected
Includes `units` relation.

### POST /properties
Auth: Protected

Body fields:
- `name` (string, required)
- `type` (enum: Apartment, Room Rental, Shop House, Villa, Land)
- `address`, `description`
- `numberOfFloors`, `totalUnits`
- `ownerName`, `ownerPhone`
- `status` (Active, Maintenance)
- `electricityPricePerKwh`, `waterPricePerM3`, `exchangeRate`
- `billingDay`, `dueDay`, `reminderBeforeDueDays`

### GET /properties/:id
Auth: Protected
Includes `units`.

### PATCH /properties/:id
Auth: Protected

### DELETE /properties/:id
Auth: Protected
Deletes property and its units. Soft delete by default.

### GET /units
Auth: Protected
Includes `property`.

### POST /units
Auth: Protected

Body fields:
- `propertyId` (number, required)
- `unitCode` (string, required)
- `floorNumber`, `roomType`, `size`
- `monthlyRent`, `weeklyRent`, `dailyRent`
- `depositAmount`, `parkingFee`, `internetFee`, `garbageFee`, `managementFee`, `additionalFee`
- `status` (Available, Occupied, Reserved, Maintenance)
- `notes`

### GET /units/:id
Auth: Protected
Includes `property`, `contracts`.

### PATCH /units/:id
Auth: Protected

### DELETE /units/:id
Auth: Protected
If referenced by contracts, it soft-deletes instead of hard delete.

## Tenants & Occupants

### GET /tenants
Auth: Protected
Includes `user`.

### POST /tenants
Auth: Protected
Content-Type: `multipart/form-data`

Form fields:
- `name` (string, required)
- `phoneNumber` (string, required)
- `idCardPassport` (file, optional)
- `emergencyContact`, `occupation`, `status`
- `occupants` (JSON string or array, optional)

Response includes auto-generated credentials and QR:
```
{
  "status": "success",
  "data": {
    "tenant": { ... },
    "credentials": { "username": "...", "password": "...", "qrDataURL": "data:image/png;base64,..." }
  }
}
```

### GET /tenants/:id
Auth: Protected
Includes `user`, `contracts`, `occupants`.

### PATCH /tenants/:id
Auth: Protected
Content-Type: `multipart/form-data` if uploading `idCardPassport`.

### DELETE /tenants/:id
Auth: Protected

### POST /tenants/:id/regenerate-qr
Auth: Protected
Regenerates tenant login password + QR.

### GET /occupants
Auth: Protected
Permission: `view tenants`

### POST /occupants
Auth: Protected
Permission: `edit tenants`
Content-Type: `multipart/form-data`

Form fields:
- `tenantId` (number, required)
- `name` (string, required)
- `relationship`, `phoneNumber`
- `idCardPassport` (file, optional)

### GET /occupants/:id
Auth: Protected
Permission: `view tenants`

### PATCH /occupants/:id
Auth: Protected
Permission: `edit tenants`

### DELETE /occupants/:id
Auth: Protected
Permission: `edit tenants`

## Contracts

### GET /contracts
Auth: Protected
Includes `tenant`, `unit`.

### POST /contracts
Auth: Protected

Body fields:
- `tenantId` (number, required)
- `unitId` (number, required)
- `startDate` (date, required)
- `endDate` (date)
- `monthlyRent` (number, required)
- `depositAmount` (number)
- `terms` (string)
- `status` (Active, Expired, Terminated)
- `billingStrategy` (unified, anniversary)
- `rentCycle` (day, week, month)
- `rentAmount` (number)

### GET /contracts/:id
Auth: Protected

### PATCH /contracts/:id
Auth: Protected

### DELETE /contracts/:id
Auth: Protected

## Utility Readings

### GET /utility-readings
Auth: Protected
Includes `unit`.

### POST /utility-readings
Auth: Protected

Body fields:
- `unitId` (number, required)
- `type` (electricity, water, required)
- `currentReading` (number, required)
- `readingDate` (date, optional)
- `note` (string, optional)

### POST /utility-readings/bulk
Auth: Protected

Body fields:
- `unitId` (number, required)
- `electricityReading` (number, optional)
- `waterReading` (number, optional)
- `readingDate` (date, optional)
- `note` (string, optional)

### GET /utility-readings/last-reading/:unitId
Auth: Protected
Returns last electricity and water readings.

### GET /utility-readings/:id
Auth: Protected

### PATCH /utility-readings/:id
Auth: Protected
Cannot update if already billed for the month.

### DELETE /utility-readings/:id
Auth: Protected
Cannot delete if already billed for the month.

## Invoices

### GET /invoices
Auth: Protected
Includes `contract`, `unit`, `tenant`, `payments`.

### POST /invoices
Auth: Protected

Body fields:
- `contractId` (number, required)
- `billingMonth` (string `YYYY-MM`, optional, defaults to current)
- `dueDate` (date, optional)
- `discount` (number, optional)

Note: Duplicate `(contractId, billingMonth)` is rejected.

### GET /invoices/:id
Auth: Protected
Includes `contract`, `unit`, `tenant`, `payments`.

### PATCH /invoices/:id
Auth: Protected

### DELETE /invoices/:id
Auth: Protected
Hard delete only if `status=draft`, otherwise soft delete.

## Payments

### GET /payments
Auth: Protected
Includes `invoice`.

### POST /payments
Auth: Protected

Body fields:
- `invoiceId` (number, required)
- `amount` (number, required)
- `paymentDate` (date, optional)
- `paymentMethod` (cash, bank_transfer, khqr, other)
- `transactionId` (string, optional)
- `attachment` (string, optional)
- `note` (string, optional)

Note: Updates invoice status to `partial` or `paid`.

### GET /payments/:id
Auth: Protected

### PATCH /payments/:id
Auth: Protected

### DELETE /payments/:id
Auth: Protected

## Maintenance

### GET /maintenance
Auth: Protected
Includes `unit`, `assignedUser`.

### POST /maintenance
Auth: Protected

Body fields:
- `unitId` (number, required)
- `type` (plumbing, electrical, structural, appliance, cleaning, other, required)
- `description` (string, required)
- `priority` (low, medium, high, urgent)
- `isBillable` (boolean)
- `cost` (number)
- `note` (string)

### PATCH /maintenance/:id/assign
Auth: Protected

Body fields:
- `assignedTo` (userId, required)

### PATCH /maintenance/:id/start
Auth: Protected

### PATCH /maintenance/:id/complete
Auth: Protected

Body fields:
- `cost` (number, optional)
- `note` (string, optional)
- `isBillable` (boolean, optional)

Note: If `cost > 0`, an expense transaction is auto-created.

### POST /maintenance/:id/invoice
Auth: Protected
Generates a standalone invoice for the maintenance item (if billable and not already invoiced).

### GET /maintenance/:id
Auth: Protected

### PATCH /maintenance/:id
Auth: Protected

### DELETE /maintenance/:id
Auth: Protected

## Transactions

### GET /transactions
Auth: Protected
Includes `property`, `unit`, `maintenance`.

### POST /transactions
Auth: Protected

Body fields:
- `categoryId` (number) or `categoryName` (string)
- `amount` (number, required)
- `description` (string, required)
- `type` (income, expense, optional; defaults to category.type)
- `propertyId` (number, optional)
- `unitId` (number, optional)
- `transactionDate` (date, optional)
- `attachment` (string, optional)
- `note` (string, optional)

### GET /transactions/:id
Auth: Protected

### PATCH /transactions/:id
Auth: Protected

### DELETE /transactions/:id
Auth: Protected

## Transaction Categories

### GET /transaction-categories
Auth: Protected

### POST /transaction-categories
Auth: Protected

Body fields:
- `name` (string, required, unique)
- `description` (string)
- `type` (income, expense)
- `isSystem` (boolean)

### GET /transaction-categories/:id
Auth: Protected

### PATCH /transaction-categories/:id
Auth: Protected

### DELETE /transaction-categories/:id
Auth: Protected
System categories cannot be deleted.

## Dashboard & Finance

### GET /dashboard/overview
Auth: Protected
Permission: `view properties`

Response:
```
{
  "status": "success",
  "data": {
    "occupancy": { "total": 0, "occupied": 0, "rate": "0%" },
    "finance": { "revenue": 0, "expenses": 0, "profit": 0 }
  }
}
```

### GET /finance/balance
Auth: Protected
Permission: `view properties`

Query params:
- `propertyId` (number, optional)
- `startDate` (date, optional)
- `endDate` (date, optional)

Response:
```
{
  "status": "success",
  "data": {
    "summary": {
      "totalRevenue": 0,
      "invoiceIncome": 0,
      "manualIncome": 0,
      "totalExpenses": 0,
      "netProfit": 0
    },
    "period": { "start": "Beginning", "end": "Now" }
  }
}
```

## Announcements

### GET /announcements
Auth: Protected
Tenant users are auto-filtered to global + their property/unit announcements.

### POST /announcements
Auth: Protected
Permission: `create announcement`
Content-Type: `multipart/form-data` if sending image.

Form fields:
- `title` (string)
- `content` (string)
- `audience` (tenant, employee, admin, manager, all)
- `propertyId` (number, optional)
- `unitId` (number, optional)
- `unitIds` (array, optional, creates multiple announcements)
- `image` (file, optional)

### GET /announcements/:id
Auth: Protected
Tenant access is restricted by their active contract and audience.

### PATCH /announcements/:id
Auth: Protected
Permission: `edit announcement`
Content-Type: `multipart/form-data` if sending image.

### DELETE /announcements/:id
Auth: Protected
Permission: `delete announcement`

## Notifications

### GET /notifications
Auth: Protected
Returns current user's notifications.

### POST /notifications
Auth: Protected
Send push and/or Telegram notifications.

Body fields:
- `title` (string, required)
- `body` (string, required)
- `type` (string, optional)
- `data` (object, optional)
- `userId` (number, optional)
- `userIds` (array, optional)
- `tokens` (array of strings, optional)
- `clickAction` (string, optional)
- `sound` (string, optional)
- `category` (string, optional)
- `imageUrl` (string, optional)
- `sendToAll` (boolean, optional)
- `sendToTelegram` (boolean, optional)

### PATCH /notifications/:id/read
Auth: Protected
Marks a notification as read.

### POST /notifications/token
Auth: Protected

Body fields:
- `fcmToken` (string) or `token` (string) or `deviceId` (string)

### DELETE /notifications/token
Auth: Protected
Clears stored FCM token.

## Feedback

### POST /feedback
Auth: Protected

Body fields:
- `message` (string, required)

## Telegram

### POST /telegram/webhook
Auth: Public (Telegram webhook)

### POST /telegram/generate-link
Auth: Protected

Body fields:
- `appUserId` (number, optional; defaults to current user)

Response:
```
{ "status": "success", "data": { "deepLink": "...", "token": "...", "expiresIn": "15m" } }
```

### POST /telegram/unlink
Auth: Protected

Body fields:
- `appUserId` (number, optional; defaults to current user)

### GET /telegram/status
Auth: Protected

Response:
```
{ "status": "success", "data": { "isLinked": true, "telegramUsername": "...", "firstName": "...", "lastName": "..." } }
```

## Me (Tenant Self-Serve)

### GET /me/tenant-profile
Auth: Protected
Returns current tenant profile with active contract, unit, property, and occupants.

### GET /me/invoices
Auth: Protected
Returns current tenant invoices (latest first).

### GET /me/payments
Auth: Protected
Returns payments for current tenant invoices.

## Images

### GET /images/*
### GET /:prefix/images/*
Public image proxy (Firebase Storage + local fallback). Use paths returned by APIs, typically `images/...`.

HEAD is also supported for these image routes.
