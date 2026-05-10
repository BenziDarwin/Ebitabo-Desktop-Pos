# Ebtabo POS Runtime Deep Dive

This document explains how the current codebase behaves at runtime, with a primary focus on authentication, then detailed coverage of the rest of the architecture.

## 1) Runtime composition at a glance

The app runtime is built from these layers:

- `providers/`
  - `AuthProvider`: auth/session state and login/logout orchestration
  - `POSProvider`: data-source and use-case wiring for POS operations
  - `CartProvider`: in-memory cart state
- `core/`
  - Entities, repository interfaces, use cases (business contracts)
- `data/`
  - Local + remote data sources and repository implementations
- `services/`
  - `SyncService` and `ClientSyncService` background synchronization
- `lib/`
  - HTTP client, storage abstraction, DB adapters, utility helpers

At app startup (`app/_layout.tsx`):

1. `AuthProvider` and `CartProvider` are mounted.
2. `AppStack` reads `isAuthenticated` + `isReady` from `useAuth()`.
3. Route gate:
   - If not ready: wait.
   - If ready and unauthenticated: `router.replace('/login')`.
   - If ready and authenticated: `router.replace('/(tabs)')`.

Inside tabs (`app/(tabs)/_layout.tsx`):

- `POSProvider` is mounted around tab screens.
- `services` tab is hidden when `business.account_type === 'Sales Business'`.

---

## 2) Authentication deep dive (primary section)

Authentication is primarily implemented in:

- `providers/AuthProvider.tsx`
- `app/login.tsx`
- `app/_layout.tsx` (route gating)
- `lib/storage.ts` (persistence backend)

### 2.1 Auth state model

`AuthProvider` exposes this context contract:

- `isAuthenticated: boolean`
- `isReady: boolean`
- `business?: BusinessDetails | null`
- `currency?: CurrencyDetails`
- `login(clientUrl, username, password)`
- `logout()`
- `getCookies()`
- `fetchBusinessDetails(clientUrl?, cookies?)` (interface name; implementation currently uses api-key + userId params)
- `getCurrency(currencyId)`

State meanings:

- `isReady = false`: provider is still restoring persisted session state.
- `isReady = true` and `isAuthenticated = false`: login screen should be active.
- `isReady = true` and `isAuthenticated = true`: app routes to tabs.

### 2.2 Persisted auth/session keys

`AuthProvider` reads/writes these keys:

- `api_key`
- `client_url`
- `business_details`
- `currency_details`
- `userID`
- `auth_cookies` (read for logout/cookie accessor; not written by current login flow)

On logout, these keys are cleared as a group.

### 2.3 Storage backend by platform

All auth persistence uses `Storage` from `lib/storage.ts`.

Web:

- uses `localStorage`

Native:

- primary store: `expo-secure-store`
- fallback: `AsyncStorage`
- migration behavior:
  - if `getItem` finds a value in `AsyncStorage`, it attempts to move it to `SecureStore` and remove fallback copy.

This means auth keys are best-effort encrypted on device (via SecureStore), with graceful fallback for devices where secure storage writes fail.

### 2.4 App boot auth restore sequence

When `AuthProvider` mounts:

1. It reads:
   - `business_details`
   - `currency_details`
   - `client_url`
   - `api_key`
2. If any required item is missing (`api_key`, `client_url`, `business_details`, `currency_details`), it marks user unauthenticated and exits restore path.
3. If all required items exist:
   - sets `isAuthenticated = true`
   - parses `business_details` via `parseJsonSafely`
   - sets `business`, forcing `apiUrl` from stored `client_url`
   - parses `currency_details` via `parseJsonSafely` and sets `currency`
4. If currency is missing but business exists, attempts `getCurrency(business.currency_id)`.
5. In all cases, finally sets `isReady = true`.

Why this matters:

- The route gate in `app/_layout.tsx` only redirects after `isReady` is true, preventing premature navigation flicker.

### 2.5 Login request flow

Login UI (`app/login.tsx`) collects:

- `clientUrl`
- `username`
- `password`

Client-side normalization before calling provider:

- trims URL
- adds `https://` if user did not include protocol

`AuthProvider.login(...)` then:

1. Normalizes URL again and stores `client_url`.
2. Calls auth endpoint:
   - `POST ${clientUrl}/ebtabo_api/`
   - Headers:
     - `Content-Type: application/json`
     - `usr: <username>`
     - `pss: <password>`
3. Reads raw text response.
4. Rejects known invalid responses:
   - HTML payloads
   - response containing `wrong login`
5. Parses JSON.
6. Success condition:
   - `resJson.Status === 'auth successful'`
   - `resJson['api-key']` exists
7. On success, stores:
   - `api_key`
   - `userID`
8. Returns `true` on success, else `false`.

Important current behavior:

- `login()` always calls `fetchBusinessDetails(...)` in `finally`, even when login fails.
- If auth failed, missing/invalid api-key usually causes `fetchBusinessDetails` to no-op with warnings.

### 2.6 Business details hydration

`fetchBusinessDetails(clientUrl?, apikey?, userId?)`:

1. Resolves URL and API key from passed args or storage.
2. Calls:
   - `POST ${clientUrl}/send_request?model=business_details.business_details`
3. Request body fields:
   - `id`, `name`, `account_type`, `currency_id`, `business_logo`, `dateExpiry`, `phone_numbers`, `contact_details`, `company_name`, `company_address`, `company_phone`, `company_email`
4. Validates non-HTML/non-invalid JSON response.
5. Parses first record (`records[0]`).
6. Maps to local business model:
   - splits `phone_numbers` string into array
   - injects `apiUrl`
   - injects `userId`
7. Stores `business_details` and updates state.
8. Resolves currency id and triggers `getCurrency(...)`.

### 2.7 Currency hydration

`getCurrency(currencyId)`:

1. Reads `api_key` and `client_url` from storage.
2. Calls:
   - `POST ${clientUrl}/send_request?model=res.currency&Id=${currencyId}`
3. Body fields:
   - `id`, `name`, `full_name`
4. Parses first record and stores it in:
   - state: `currency`
   - storage: `currency_details`
5. Sets `isAuthenticated = true`.

### 2.8 Route gating after auth changes

Routing is handled centrally by `AppStack` in `app/_layout.tsx`:

- if `isReady && !isAuthenticated`: force `/login`
- if `isReady && isAuthenticated`: force `/(tabs)`

So successful login eventually leads to tabs when `isAuthenticated` becomes true, and logout returns to `/login`.

### 2.9 Logout flow (remote + local)

`logout()` does three phases:

1. Remote session logout (best effort)
   - if `client_url` and `auth_cookies` exist, calls:
     - `GET ${clientUrl}/web/session/logout`
     - `Cookie` header set from `auth_cookies`
2. Local data wipe
   - clears all POS tables via `clearLocalPosData()`
   - web/native implementation resolved by platform
3. Auth/session key cleanup
   - clears all auth keys from storage
   - resets in-memory auth/business/currency state

User-facing warning is shown in `profile.tsx` before logout, explaining local data deletion consequences.

### 2.10 Authentication error handling patterns

Current behavior is defensive and user-focused:

- Uses `showAlert` for user-visible errors (web `window.alert`, native `Alert.alert`).
- Uses raw text checks before JSON parse to avoid HTML parsing crashes.
- Uses `parseJsonSafely` for persisted JSON reads.
- Logs errors to console and keeps provider stable (`isReady` always set in restore flow).

### 2.11 Current implementation notes (important nuances)

These are factual runtime notes from current code:

- `auth_cookies` is read in logout/getCookies, but current login flow stores `api_key` and `userID` (not `auth_cookies`).
- `login()` triggers business hydration in `finally`, including failed login attempts.
- There is no token refresh flow; session continuity depends on persisted `api_key` validity.

---

## 3) Providers layer in detail

### 3.1 `AuthProvider`

Responsibilities:

- Session restore
- Login/logout
- Business/currency context hydration
- Exposing auth context to the app

### 3.2 `POSProvider`

`POSProvider` is the runtime composition root for POS domain services.

Initialization flow:

1. Calls `initDatabase()`.
2. Reads `business_details` from storage.
3. Creates local data sources:
   - `LocalProductDataSource`
   - `LocalServiceDataSource`
   - `LocalClientDataSource`
   - `LocalSalesRecordsDataSource`
   - `LocalOrderRecordsDataSource`
4. Creates remote data sources using `biz.apiUrl`:
   - `RemoteProductDataSource`
   - `RemoteServiceDataSource`
   - `RemoteClientDataSource`
   - `RemoteSalesRecordDataSource`
5. Creates repositories and use cases.
6. Creates sync orchestrators:
   - `SyncService`
   - `ClientSyncService`
7. Exposes all through `POSContext`.

Connectivity handling:

- Subscribes to NetInfo.
- Updates `isOnline`.
- On reconnect, triggers both sync services.

### 3.3 `CartProvider`

Simple UI-state provider for cart workflows:

- `cart` list and setter
- optional `onCheckoutComplete` callback
- `setOnCheckoutComplete` helper

---

## 4) `core` layer (domain contracts)

`core/` is interface-first and framework-agnostic.

### 4.1 Entities

- Business/session entities:
  - `BusinessDetails`, `CurrencyDetails`
- Catalog + client:
  - `Product`, `Service`, `Client`
- Transactional models:
  - `OrderRecord`
  - Sales payload contracts (`SalesRecord.ts`)
  - Sales persisted/normalized contracts (`SalesRecordEntity.ts`)

### 4.2 Repository interfaces

- Catalog:
  - `IProductRepository`, `IServiceRepository`, `IClientRepository`
- Orders:
  - `IGetOrdersRecordsRepository`, `IOrderRecordsRepository`
- Sales:
  - `IGetSalesRecordsRepository`, `ISalesRecordsRepository`

### 4.3 Use cases

Read use cases:

- `GetAllProducts`
- `GetAllServices`
- `GetAllClients`
- `GetAllOrdersRecords`
- `GetAllSalesRecords`

Write/update use cases:

- `CreateOrderRecord`
- `UpdateOrderRecord`
- `CreateSalesRecord`
- `UpdateProduct`

Use cases are intentionally thin wrappers over repository contracts.

---

## 5) `lib` layer (shared infrastructure)

### 5.1 `lib/api.ts` (`ApiClient`)

- Wrapper over `fetch`.
- Automatically injects `api-key` header from storage.
- Exposes HTTP verbs (`get`, `post`, `put`, `patch`, `delete`).
- Performs response hardening:
  - rejects HTML/invalid JSON-like responses
  - parses text manually into JSON
  - surfaces server message or HTTP status error

### 5.2 `lib/storage.ts`

- Cross-platform persistence abstraction.
- Web: `localStorage`.
- Native: `SecureStore` with `AsyncStorage` fallback.
- Includes key cleanup helpers (`clearKeys`).

### 5.3 `lib/database.ts` (native) and `lib/database.web.ts` (web)

Native (`expo-sqlite`):

- Creates tables:
  - `products`, `services`, `order_records`, `sales_records`, `clients_products`, `clients_services`
- Adds indices.
- Applies additive schema migrations for `sales_records` columns (`resultId`, `cancelled`, `create_uid`, `description`).
- Supports transactional `clearLocalPosData()`.

Web (`Dexie` adapter):

- Emulates SQLite-like API used by data sources.
- Keeps schema version history with migration logic.
- Includes v4 correction for `orders_records` -> `order_records` mismatch.
- Parses and handles SQL-like app query patterns (`LIKE`, order/date filters, updates, batch inserts).

### 5.4 Utility helpers

- `safeJson.ts`: defensive JSON parsing with fallback.
- `resolveImageUri.ts`: accepts real URIs or converts raw base64 to data URI.
- `getCatalogImageSource.ts`: image source + fallback asset helpers.
- `showAlert.ts` / `confirmAction.ts`: cross-platform alert/confirm wrappers.

---

## 6) `data` layer behavior (implementation details)

The `data` layer realizes `core` repository contracts.

### 6.1 Local-first reads

Most reads are local-first:

- Products/services/clients/order records read from local DB.
- Sales history list (`getAll`) reads local DB.

### 6.2 Sales write strategy (remote-first attempt, local persistence always)

`SalesRecordRepositoryImpl` behavior:

- On sale create (`executeProducts` / `executeServices`):
  - tries remote create first
  - always saves local record
  - stores remote `resultId` when available
  - if remote fails, saves pending local record (`resultId = null`)

This is the offline resilience backbone for sales sync.

### 6.3 Orders write strategy (local only)

`OrderRecordRepositoryImpl`:

- creates order records locally only
- supports local update/delete/clear

Orders are draft-like local records, later convertible to sales.

### 6.4 Local source safeguards

Local data sources include important runtime guards:

- JSON parse safety for persisted line-item arrays (`itemsSoldLines`, `paymentLines`).
- Atomic replace flows for products/clients with transaction + rollback.
- Empty-payload protection to avoid wiping non-empty local tables when a remote sync unexpectedly returns empty results.
- Product replace lock/retry for `database is locked` scenarios.

---

## 7) `services` layer (sync orchestration)

### 7.1 `SyncService` (catalog sync)

Main actions:

1. Concurrency guard (`isSyncing`, shared `syncPromise`).
2. Connectivity check (native via NetInfo; web assumes connected path).
3. Reads business details from storage.
4. Pulls remote products; optionally remote services (non-`Sales Business`).
5. Preserves local images if remote images are missing.
6. Adjusts product stock by subtracting quantities reserved in open local orders.
7. Replaces local tables.

### 7.2 `ClientSyncService` (client sync)

Main actions:

1. Concurrency guard (`isSyncing`).
2. Connectivity check.
3. Account-type based remote source selection:
   - `Sales Business` -> product clients
   - otherwise -> service clients
4. For product-style client data, adjusts available quantities based on open orders.
5. Replaces target local client table.

---

## 8) Detailed runtime flows by screen

### 8.1 Login screen (`app/login.tsx`)

- Validates all required fields.
- Normalizes URL with protocol.
- Calls `useAuth().login(...)`.
- Shows loading indicator and alert-based error reporting.

### 8.2 Sell screen (`app/(tabs)/index.tsx`)

- Loads local catalog via use cases.
- On focus, triggers background sync when online, then reloads local catalog.
- Supports order edit mode by loading an existing order into cart.
- Preserves custom unit prices in edit mode.
- Applies stock checks when adding products.
- Updates existing order and product stock deltas when saving edits.

### 8.3 Cart screen (`app/(tabs)/cart.tsx`)

- Manages item quantity/price edits.
- Validates stock and business expiry before checkout.
- Creates a local order record (`createOrdersRecords`) with account-type specific payload shape.
- Immediately updates local product stock after order creation.

### 8.4 Orders screen (`app/(tabs)/orders.tsx`)

- Reads local order records on focus.
- Loads/syncs clients via `clientSyncService` + `getAllClients`.
- Supports editing lines, discounts, optional manual totals.
- Can save edits back to local order and adjust local product stock.
- Convert-to-sale flow:
  - requires client
  - builds account-type specific sale payload
  - creates sale record via `createSalesRecords`
  - updates stock
  - deletes source order record

### 8.5 History screen (`app/(tabs)/history.tsx`)

- Reads local sales records.
- Auto-attempts sync of unsynced records on focus.
- Manual sync button replays pending local sales to remote and updates local `resultId` via sync methods.
- Supports canceling synced records remotely and marking local record canceled.
- Supports local record deletion and receipt printing.

### 8.6 Dashboard (`app/(tabs)/dashboard.tsx`)

- Fetches daily sales summary by user from remote (`getSalesRecordsByUserId`).
- Applies time filters (`today`, `week`, `month`, `all`).
- Renders totals, growth, chart, and daily list.

### 8.7 Profile (`app/(tabs)/profile.tsx`)

- Shows business and currency context.
- Provides explicit logout warning about local data deletion.
- Calls `logout()` and routes back to `/login` on success.

---

## 9) API integrations currently used

Authentication + context:

- `/ebtabo_api/`
- `/send_request?model=business_details.business_details`
- `/send_request?model=res.currency&Id=<currencyId>`
- `/web/session/logout` (cookie-based path, conditional)

Catalog + clients:

- `/send_request?model=products.products`
- `/send_request?model=services.services`
- `/send_request?model=the_sales.business_clients`
- `/send_request?model=services.business_clients`

Sales:

- `/send_request?model=the_sales.the_sales`
- `/send_request?model=services.service_sales`
- cancel operations on same models via `PUT` + `function: cancel_sale`

Reporting:

- `/send_request?model=business_reports.business_summary_userreport&user_id=<id>` with `function: get_daily_sales`

---

## 10) Summary of architectural intent

- `AuthProvider` owns session lifecycle and business context hydration.
- `POSProvider` wires repositories/use-cases/sync services after database init.
- `core` defines business contracts; `data` implements them.
- `lib` isolates infrastructure and platform differences.
- `services` keep local data synchronized and offline-safe.

The net effect is a local-first POS app with resilient offline behavior, account-type aware sale flows, and centralized authentication/session management.

---

## 11) Interface reference for common variables and algorithms

This section gives a practical contract guide for the variables used most often in runtime logic: orders, sales, and sale-conversion payloads.

### 11.1 Canonical interfaces (source of truth)

These come from `core/entities/*`.

```ts
// Local order draft (order_records table)
export interface OrderRecord {
  id: string;
  clientId: string;
  dateSale: string;
  totalDiscount: number;
  reference: string;
  type: "product" | "service";
  itemsSoldLines: ItemSoldLine[]; // see note below about runtime line formats
  paymentLines: PaymentLine[];
  createdAt: string;
  updatedAt: string;
}

// API request wrapper for create/sync calls
export interface CreateSaleAPIRequest<T> {
  fields: string[];
  values: T;
}

// Product-sale payload shape (Sales Business)
export interface CreateProductSalePayload {
  client_id: number;
  reference: string;
  dateSale: string;
  totalDiscount: number;
  create_uid: number;
  description?: string;
  items_sold_lines: ProductSaleItem[];
  payment_lines: PaymentLine[];
}

export interface ProductSaleItem {
  item_sold: number;
  number_sold: number;
  item_quantity: number;
  item_new_quantity: number;
  unit_cost: number;
  total_amount: number;
  currency_id: number;
}

// Service-sale payload shape (Services Business)
export interface CreateServiceSalePayload {
  client_id: number;
  reference: string;
  dateSale: string;
  totalDiscount: number;
  create_uid: number;
  description?: string;
  items_sold_lines: ServiceSaleItem[];
  payment_lines: PaymentLine[];
}

export interface ServiceSaleItem {
  item_type: "Service" | "Product";
  item_sold_product?: number;
  item_sold_product_name: string;
  item_sold_service?: number;
  number_sold: number;
  item_product_quantity?: number;
  item_product_new_quantity?: number;
  unit_cost: number;
  total_amount: number;
  currency_id: number;
}

// Persisted local sale record (sales_records table)
export interface SaleRecord {
  id: string;
  clientId: string;
  reference: string;
  cancelled?: number;
  dateSale: string;
  create_uid: number;
  description?: string;
  totalDiscount: number;
  type: "product" | "service";
  resultId: number | null; // null => pending sync
  itemsSoldLines: ItemSoldLine[];
  paymentLines: PaymentLine[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentLine {
  modePayment:
    | "Cash"
    | "Mobile Money"
    | "Bank Transfer"
    | "Debit/Credit Card"
    | "Advance";
  datePayment: string;
  advancedAmount: number;
  amountPaid: number;
  currency_id: number; // request payload variant
  // currencyId string exists in local normalized variant
}
```

### 11.2 Runtime "common variable" shapes actually consumed by algorithms

Because the app mixes normalized and API-like line formats across screens, algorithms often read multiple key names for the same meaning.

```ts
// Compatibility shape used by stock/sync/edit algorithms
export interface FlexibleLineItem {
  // identity
  item_type?: "Product" | "Service";
  item_sold?: number;
  item_sold_product?: number;
  item_sold_service?: number;
  item_product?: number;
  itemSold?: number;

  // labels
  item_name?: string;
  item_sold_product_name?: string;

  // quantity fields accepted by different flows
  number_sold?: number;
  numberSold?: number;
  quantity?: number;

  // pricing
  unit_cost?: number;
  total_amount?: number;

  // stock snapshots (before/after)
  item_quantity?: number;
  item_new_quantity?: number;
  item_product_quantity?: number;
  item_product_new_quantity?: number;

  // currency
  currency_id?: number | string;
  currencyId?: string;
}
```

Important note:

- `OrderRecord.itemsSoldLines` is typed in `core` as normalized `ItemSoldLine[]` (camelCase), but runtime storage/edit flows frequently persist and consume snake_case API-style lines.
- This is why sync and stock algorithms use fallbacks like `item_sold_product ?? item_sold ?? itemSold`.

### 11.3 Common variables by feature

| Variable                  | Typical Type                         | Used In                  | Meaning                                                    |
| ------------------------- | ------------------------------------ | ------------------------ | ---------------------------------------------------------- |
| `ordersRecords`           | `OrderRecord[]`                      | Orders screen            | Local draft orders list                                    |
| `selectedRecord` (orders) | `OrderRecord or null`                | Orders/Sell edit mode    | Active order being viewed/edited/converted                 |
| `salesRecords`            | `SaleRecord[]`                       | History screen           | Local sales history (synced + pending)                     |
| `unsyncedRecords`         | `SaleRecord[]`                       | History sync             | Sales where `resultId == null`                             |
| `currentItems`            | `FlexibleLineItem[]`                 | Orders convert/update    | Mutable line set used for totals, discounts, payload build |
| `payment_lines`           | `PaymentLine[]`                      | Cart/Orders/History sync | Payment payload sent during create/sync                    |
| `requestBody`             | `CreateSaleAPIRequest<T>`            | Cart/Orders/History sync | Final payload wrapper for API                              |
| `stockAdjustments`        | `{ id: string; newStock: number }[]` | Sell/Cart/Orders         | Bulk stock update instructions                             |

### 11.4 Algorithms that use these variables

#### A) Checkout to local order (`CartScreen.handleCheckout`)

Inputs:

- `cart` items
- `business.account_type`
- `currency.id`, `business.userId`

Algorithm:

1. Validate cart non-empty, subscription not expired, and stock constraints.
2. Build `payment_lines` with current total.
3. Build account-type specific `items_sold_lines`.
4. Wrap in `CreateSaleAPIRequest<T>`.
5. Save as local order via `createOrdersRecords.executeProducts/executeServices`.
6. Apply immediate local `stockAdjustments` through `updateProduct.updateProducts`.

#### B) Edit existing order (`SellScreen.handleUpdateOrder` + Orders modal save)

Inputs:

- `editingOrder`
- edited cart/line state

Algorithm:

1. Build map of previous quantities from original order lines.
2. Recompute each line's `unit_cost`, `total_amount`, and stock snapshot fields.
3. Compute stock delta per product: `newDelta = newQty - previousQty`.
4. Persist updated `OrderRecord`.
5. Run bulk stock updates from computed deltas.

#### C) Convert order to sale (`OrdersScreen.handleConvertOrderToSale`)

Inputs:

- selected `OrderRecord`
- selected client and payment method
- edited lines/discount

Algorithm:

1. Validate selected client and subscription state.
2. Normalize `currentItems` into strict payload shape:
   - product order -> `CreateProductSalePayload`
   - service order -> `CreateServiceSalePayload`
3. Build `payment_lines`.
4. Execute remote+local sale creation via `createSalesRecords.execute*`.
5. Apply stock updates from payload's "new quantity" values.
6. Delete source order record from local orders table.

#### D) Replay pending sales (`HistoryScreen.handleSync`)

Inputs:

- `salesRecords` where `resultId == null`

Algorithm:

1. Iterate each pending sale.
2. Rebuild `payment_lines` and request payload from stored record.
3. Call `createSalesRecords.syncProducts/syncServices`.
4. Repository updates existing local sale with returned remote `resultId`.
5. Refresh list; synced entries move from pending to synced state.

#### E) Catalog stock reconciliation (`SyncService.pullProductsFromRemote`)

Inputs:

- remote products
- local open orders (`order_records`)

Algorithm:

1. Aggregate booked quantity per product from open order line items.
2. For each remote product, compute:
   - `available = remoteStock - bookedQty`
   - clamp to `>= 0`
3. Replace local product table with adjusted values.

Purpose:

- Prevents double-selling by reflecting reserved stock from unsold local orders.
