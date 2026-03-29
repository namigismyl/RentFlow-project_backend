# RentFlow Backend — Development Plan (v3 Final)

## Context

We have a modular Node.js/Express skeleton with auth, product, and rental modules. All services are empty.
Routes are wired in app.js. MongoDB via Mongoose. No business logic exists yet.

**Existing deps:** express 5.2.1, mongoose 9.3.3, cors, dotenv, nodemon
**Required new deps:** bcryptjs, jsonwebtoken, express-rate-limit, helmet

---

## Calculation System Design

The billing engine is the core of this system. Every pricing decision flows through these rules.

### Rule 1: Full Month

A full calendar month (e.g. March 1–31, April 1–30, Feb 1–28/29):

    charge = quantity × monthlyPrice

No division. No daily rate. The full price applies as-is.

How to detect: segment start = 1st of month AND segment end = last day of that month.

### Rule 2: Partial Period

Any period that is NOT a full calendar month:

    charge = quantity × numberOfDays × (monthlyPrice / 30)

"numberOfDays" = count of days in the partial segment.

### Rule 3: Month Boundary Splitting

Any period that crosses a calendar month boundary MUST be split before pricing.

Example: March 20 → April 11

Split into:
- Segment A: March 20 → March 31 (partial March, 12 days)
- Segment B: April 1 → April 11 (partial April, 11 days)

Each segment is priced independently using Rule 1 or Rule 2.

A multi-month span like Jan 15 → April 10 becomes:
- Jan 15 → Jan 31 (partial, 17 days)
- Feb 1 → Feb 28 (full month → Rule 1)
- Mar 1 → Mar 31 (full month → Rule 1)
- Apr 1 → Apr 10 (partial, 10 days)

Monthly-first thinking: always check full months first, daily rate only for leftover partials.

### Rule 4: Partial Return — Returned Units

Returned units are ALWAYS charged from the item's CURRENT startDate → returnDate.

At rental creation, item.startDate = rental startDate (original).
After a previous return, item.startDate = that previous return's date.

So for the FIRST return, the charge is from original startDate.
For subsequent returns, the charge is from the last return date (because startDate was updated).

This is NOT "always from original" — it is "always from item.startDate," which starts as the original
and advances after each return for the remaining units.

### Rule 5: Remaining Units After Return

After return: remaining units' startDate = returnDate.
They continue forward normally from this new startDate.

### Rule 6: Multiple Returns — Walkthrough

Start: March 1, quantity: 10, monthlyPrice: 3000

Return A (March 10): return 3 units
- item.startDate is currently March 1 (original)
- Charge for 3 units: calculatePeriod(March 1, March 10, 3, 3000)
    → 10 days × 3 × (3000/30) = 10 × 3 × 100 = 3000
- item.startDate advances to March 10 (for remaining 7 units)

Return B (March 20): return 2 units
- item.startDate is currently March 10
- Charge for 2 units: calculatePeriod(March 10, March 20, 2, 3000)
    → 10 days × 2 × (3000/30) = 10 × 2 × 100 = 2000
- item.startDate advances to March 20 (for remaining 5 units)

Close (April 15):
- item.startDate is currently March 20
- Charge for 5 units: calculatePeriod(March 20, April 15, 5, 3000)
    → Split: March 20–31 (12 days) + April 1–15 (15 days)
    → March segment: 12 × 5 × 100 = 6000
    → April segment: 15 × 5 × 100 = 7500
    → Total: 13500

Grand total: 3000 + 2000 + 13500 = 18500

### Rule 7: Closing a Rental

For each item where remainingQuantity > 0:
    charge = calculatePeriod(item.startDate, closeDate, item.remainingQuantity, item.monthlyPrice)

Uses month splitting internally.

### Data Model Requirements for Calculation

Each rental item must track:
- startDate: advances after each return (for remaining units)
- originalStartDate: never changes, kept for audit/reference
- returns[]: array of { returnDate, quantity, amount, calculatedFrom } for audit trail

---

## PHASE 1: Auth System

### Task 1.1 — Install Auth Dependencies

**Objective:** Add bcryptjs and jsonwebtoken packages. Add JWT_SECRET to environment config.

**Files:** package.json, .env

**Steps:**
1. Run npm install bcryptjs jsonwebtoken
2. Add JWT_SECRET=rentflow_jwt_secret_2026 to .env file

**Expected Result:** Both packages listed in package.json dependencies. process.env.JWT_SECRET accessible after dotenv.config().

---

### Task 1.2 — Implement Register Service

**Objective:** Build user registration with duplicate detection and password hashing.

**Files:** src/modules/auth/auth.service.js

**Steps:**
1. Import User model, bcryptjs, and AppError
2. In register(data): extract name, email, password from data
3. Query User.findOne({ email }) — if found, throw AppError("Email already registered", 400)
4. Hash password: bcrypt.hash(password, 10)
5. Create user: User.create({ name, email, password: hashedPassword })
6. Return plain object { _id, name, email } — never include password

**Expected Result:** POST /api/auth/register with { name, email, password } creates user in DB with hashed password. Returns 201 with { success: true, data: { _id, name, email } }. Duplicate email returns 400.

---

### Task 1.3 — Implement Login Service

**Objective:** Authenticate user and issue JWT token.

**Files:** src/modules/auth/auth.service.js

**Steps:**
1. Import jsonwebtoken
2. In login(data): extract email, password
3. Find user by email — if not found, throw AppError("Invalid email or password", 401)
4. Compare password with bcrypt.compare — if mismatch, throw same 401 error (generic message prevents email enumeration)
5. Sign JWT: jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" })
6. Return { token, user: { _id, name, email } }

**Expected Result:** POST /api/auth/login with valid credentials returns 200 with JWT token. Invalid credentials return 401 with generic message.

---

### Task 1.4 — Implement JWT Verification Middleware

**Objective:** Replace placeholder auth middleware with real JWT verification.

**Files:** src/middleware/auth.js

**Steps:**
1. Import jsonwebtoken and AppError
2. Read req.headers.authorization
3. If missing or doesn't start with "Bearer ", throw AppError("Access denied. No token provided.", 401)
4. Extract token after "Bearer "
5. Try jwt.verify(token, process.env.JWT_SECRET) — on failure, throw AppError("Invalid or expired token", 401)
6. Set req.user = decoded (contains { id, iat, exp })
7. Call next()

**Expected Result:** All routes using auth middleware now require valid Bearer token. Requests without token or with expired/invalid token get 401.

---

## PHASE 2: Product Module

### Task 2.1 — Implement Product Create Service

**Objective:** Create products with automatic stock initialization.

**Files:** src/modules/product/product.service.js

**Steps:**
1. Import Product model and AppError
2. In create(data): if data.availableQuantity is undefined, set it to data.totalQuantity
3. Create and return: Product.create(data)

**Expected Result:** POST /api/products with { name, totalQuantity, monthlyPrice } creates product. availableQuantity auto-set to totalQuantity. Returns 201.

---

### Task 2.2 — Implement Product Read Services

**Objective:** Fetch products with active-only filtering.

**Files:** src/modules/product/product.service.js

**Steps:**
1. getAll(): return Product.find({ isActive: true }).sort({ createdAt: -1 })
2. getById(id): find by ID. If not found, throw AppError("Product not found", 404). Return product.

**Expected Result:** GET /api/products returns only active products, newest first. GET /api/products/:id returns single product or 404.

---

### Task 2.3 — Implement Product Update Service

**Objective:** Update product with stock consistency protection.

**Files:** src/modules/product/product.service.js

**Steps:**
1. In update(id, data): find product by ID, throw 404 if missing
2. If data.totalQuantity is provided and differs from current:
   - Calculate rentedCount = product.totalQuantity - product.availableQuantity
   - If data.totalQuantity < rentedCount, throw AppError("Cannot reduce total below currently rented quantity", 400)
   - Set data.availableQuantity = data.totalQuantity - rentedCount
3. Apply update with findByIdAndUpdate(id, data, { new: true, runValidators: true })
4. Return updated product

**Expected Result:** PUT /api/products/:id updates product. Stock consistency maintained. Cannot reduce totalQuantity below rented count.

---

### Task 2.4 — Implement Product Soft Delete

**Objective:** Deactivate product without destroying references.

**Files:** src/modules/product/product.service.js

**Steps:**
1. In remove(id): find product by ID, throw 404 if missing
2. Set product.isActive = false
3. Save and return

**Expected Result:** DELETE /api/products/:id soft-deletes. Product excluded from getAll but remains in DB for rental references.

---

## PHASE 3: Rental Creation

### Task 3.1 — Update Rental Item Schema

**Objective:** Modify the rental item sub-schema to support the correct calculation model.

**Files:** src/modules/rental/rental.model.js

**Steps:**
1. Remove lastCalculationDate field from rentalItemSchema
2. Add startDate field (Date, required) — the active calculation start, advances after each return
3. Add originalStartDate field (Date, required) — never changes, for audit reference
4. Add returns array field with sub-schema: { returnDate (Date), quantity (Number), amount (Number) }
5. Keep all existing fields: product, quantity, remainingQuantity, returnedQuantity, monthlyPrice, totalAmount

**Expected Result:** Rental item schema supports: tracking effective startDate separately from original, and logging every return event for audit.

---

### Task 3.2 — Implement Rental Create Service

**Objective:** Create rentals with stock validation and deduction.

**Files:** src/modules/rental/rental.service.js

**Steps:**
1. Import Rental model, Product model, AppError
2. In create(data): extract customer, items, startDate
3. Validate items is non-empty array
4. For each item in items:
   a. Find product by item.productId — throw 404 if not found
   b. If product.isActive is false — throw AppError("Product is not available", 400)
   c. If item.quantity > product.availableQuantity — throw AppError("Insufficient stock for: " + product.name, 400)
   d. Deduct: product.availableQuantity -= item.quantity, save product
   e. Build rental item: { product: product._id, quantity: item.quantity, remainingQuantity: item.quantity, returnedQuantity: 0, monthlyPrice: product.monthlyPrice, startDate: new Date(startDate), originalStartDate: new Date(startDate), totalAmount: 0, returns: [] }
5. Create rental: Rental.create({ customer, items: builtItems, startDate: new Date(startDate) })
6. Return rental

**Expected Result:** POST /api/rentals creates rental. Stock deducted from each product. Each item has startDate and originalStartDate set to rental startDate. Insufficient stock → 400.

---

### Task 3.3 — Implement Rental Read Services

**Objective:** Fetch rentals with product details populated.

**Files:** src/modules/rental/rental.service.js

**Steps:**
1. getAll(): Rental.find().populate("items.product", "name monthlyPrice").sort({ createdAt: -1 })
2. getById(id): find by ID with same population. Throw 404 if not found.

**Expected Result:** GET /api/rentals returns all rentals with product names. GET /api/rentals/:id returns single populated rental or 404.

---

## PHASE 4: Calculation Core (Utility Layer)

### Task 4.1 — Create Month Boundary Splitter

**Objective:** Pure function that splits any date range into calendar-month-bounded segments.

**Files:** src/utils/splitByMonth.js (NEW)

**Steps:**
1. Function: splitByMonth(startDate, endDate)
2. Convert both to Date objects
3. Initialize segments array and cursor = start date
4. Loop while cursor <= endDate:
   a. Determine end of current month (last day of cursor's month)
   b. Segment end = min(endOfMonth, endDate)
   c. Push { start: cursor, end: segmentEnd }
   d. Move cursor to 1st of next month
5. Return segments array

**Example outputs:**
- splitByMonth(March 20, March 25) → [{ start: Mar 20, end: Mar 25 }]
- splitByMonth(March 20, April 11) → [{ start: Mar 20, end: Mar 31 }, { start: Apr 1, end: Apr 11 }]
- splitByMonth(Jan 1, Mar 31) → [{ start: Jan 1, end: Jan 31 }, { start: Feb 1, end: Feb 28 }, { start: Mar 1, end: Mar 31 }]

**Expected Result:** Any date range correctly split. No segment crosses a month boundary. Single-month ranges return a single segment.

---

### Task 4.2 — Create Single Segment Calculator

**Objective:** Pure function that prices one within-month segment.

**Files:** src/utils/calculateSegment.js (NEW)

**Steps:**
1. Function: calculateSegment(start, end, quantity, monthlyPrice)
2. Convert to Date objects
3. Check if full calendar month:
   - start is 1st of month AND end is last day of same month
   - How to check last day: create Date for 1st of next month, subtract 1 day
4. If full month: return quantity × monthlyPrice
5. If partial: count days = difference in days between start and end (inclusive: end - start + 1 in day units... or use the simpler: calculate diffTime / msPerDay and round)
   - IMPORTANT: need to decide on day counting convention. Use: days = (endDate - startDate) / (1000×60×60×24) treating the range as start-inclusive, end-inclusive, so March 20 to March 31 = 12 days
6. Return quantity × days × (monthlyPrice / 30)

**Expected Result:** Full month segment returns exact monthlyPrice × quantity. Partial segment returns daily-prorated amount.

---

### Task 4.3 — Create Total Period Calculator

**Objective:** Entry-point function that chains splitting and segment calculation.

**Files:** src/utils/calculatePeriod.js (NEW)

**Steps:**
1. Function: calculatePeriod(startDate, endDate, quantity, monthlyPrice)
2. Call splitByMonth(startDate, endDate) to get segments
3. For each segment: call calculateSegment(segment.start, segment.end, quantity, monthlyPrice)
4. Sum all segment amounts
5. Return Math.round(total × 100) / 100 (round to 2 decimals)

**Expected Result:** Single function call handles any rental period:
- Same-month partial → direct daily calc
- Full month → full price
- Cross-month → split then calculate each

Verification example:
calculatePeriod(March 1, March 31, 2, 3000) → 2 × 3000 = 6000 (full month)
calculatePeriod(March 20, April 11, 5, 3000) → March partial + April partial

---

## PHASE 5: Partial Return Logic

### Task 5.1 — Implement Partial Return Service

**Objective:** Process a partial return with correct billing and stock restoration.

**Files:** src/modules/rental/rental.service.js

**Steps:**
1. Import calculatePeriod from utils
2. In partialReturn(rentalId, data): extract itemId, returnQuantity, returnDate
3. Find rental by ID — throw 404 if missing
4. Validate rental.status === "ACTIVE" — throw AppError("Rental is not active", 400) if not
5. Find item in rental.items by _id matching itemId — throw AppError("Rental item not found", 404)
6. Validate returnQuantity <= item.remainingQuantity — throw error if exceeded
7. Validate returnDate >= item.startDate — throw error if before
8. Calculate: amount = calculatePeriod(item.startDate, returnDate, returnQuantity, item.monthlyPrice)
9. Update item:
   - item.totalAmount += amount
   - item.remainingQuantity -= returnQuantity
   - item.returnedQuantity += returnQuantity
   - item.startDate = new Date(returnDate) ← ADVANCES for remaining units
   - item.returns.push({ returnDate: new Date(returnDate), quantity: returnQuantity, amount })
10. Restore stock: find product, product.availableQuantity += returnQuantity, save product
11. Recalculate: rental.totalAmount = sum of all items' totalAmount
12. Save rental
13. Return updated rental

**Expected Result:** PATCH /api/rentals/:id/return correctly:
- Charges returned units from item.startDate → returnDate
- Advances item.startDate for remaining units
- Restores stock to product
- Logs return in item.returns array
- Recalculates rental total

---

## PHASE 6: Rental Closing Logic

### Task 6.1 — Implement Close Rental Service

**Objective:** Finalize all remaining charges and close the rental.

**Files:** src/modules/rental/rental.service.js

**Steps:**
1. In close(rentalId, data): extract closeDate
2. Find rental — throw 404 if missing
3. Validate rental.status === "ACTIVE"
4. Loop through rental.items:
   - If item.remainingQuantity > 0:
     a. amount = calculatePeriod(item.startDate, closeDate, item.remainingQuantity, item.monthlyPrice)
     b. item.totalAmount += amount
     c. Find product, product.availableQuantity += item.remainingQuantity, save product
     d. item.returnedQuantity += item.remainingQuantity
     e. item.remainingQuantity = 0
     f. item.startDate = new Date(closeDate)
5. rental.status = "COMPLETED"
6. rental.endDate = new Date(closeDate)
7. rental.totalAmount = sum of all items' totalAmount
8. Save rental
9. Return updated rental

**Expected Result:** PATCH /api/rentals/:id/close:
- Calculates final segment for every item with remaining quantity
- Uses month splitting for cross-month periods
- Restores all remaining stock
- Marks rental COMPLETED with endDate
- Final totalAmount reflects all charges

---

## PHASE 7: Validation and Error Handling

### Task 7.1 — Create Reusable Validation Middleware

**Objective:** Build a lightweight validation factory without external libraries.

**Files:** src/middleware/validate.js (NEW)

**Steps:**
1. Export function validate(rules) that returns (req, res, next)
2. rules is an object: { fieldName: { required: bool, type: "string"|"number"|"array", min: number, pattern: regex, message: string } }
3. Loop through rules, check req.body for each field
4. Collect errors into array
5. If errors exist, throw AppError(errors.join(", "), 400)
6. If clean, call next()

**Expected Result:** Reusable middleware importable by any route file.

---

### Task 7.2 — Apply Validation to Auth Routes

**Objective:** Validate auth request bodies.

**Files:** src/modules/auth/auth.routes.js

**Steps:**
1. Import validate middleware
2. Register route: validate name (required, string), email (required, email pattern), password (required, string, min 6)
3. Login route: validate email (required), password (required)

**Expected Result:** Missing or malformed auth data → 400 with clear messages.

---

### Task 7.3 — Apply Validation to Product Routes

**Objective:** Validate product request bodies.

**Files:** src/modules/product/product.routes.js

**Steps:**
1. POST: name (required, string), totalQuantity (required, number, min 1), monthlyPrice (required, number, min 1)
2. PUT: same fields but none required (partial updates allowed)

**Expected Result:** Invalid product data → 400.

---

### Task 7.4 — Apply Validation to Rental Routes

**Objective:** Validate rental request bodies.

**Files:** src/modules/rental/rental.routes.js

**Steps:**
1. POST: customer (required, string), items (required, array), startDate (required)
2. PATCH return: returnQuantity (required, number, min 1), returnDate (required)
3. PATCH close: closeDate (required)

**Expected Result:** Invalid rental data → 400.

---

### Task 7.5 — Add MongoDB ObjectId Validation

**Objective:** Catch invalid ObjectId format before Mongoose throws CastError.

**Files:** src/middleware/validateId.js (NEW), src/modules/product/product.routes.js, src/modules/rental/rental.routes.js

**Steps:**
1. Create validateId middleware: check mongoose.Types.ObjectId.isValid(req.params.id)
2. If invalid → AppError("Invalid ID format", 400)
3. Apply to all :id routes in product and rental

**Expected Result:** /api/products/notanid → 400 with clean error instead of Mongoose internal error.

---

## PHASE 8: Security

### Task 8.1 — Add Rate Limiting to Auth Routes

**Objective:** Protect auth endpoints from brute-force attacks.

**Files:** package.json, src/modules/auth/auth.routes.js

**Steps:**
1. Install express-rate-limit
2. Create limiter: windowMs = 15 minutes, max = 20 requests
3. Apply to /register and /login routes

**Expected Result:** 21st request within 15 minutes → 429 Too Many Requests.

---

### Task 8.2 — Add Helmet Security Headers

**Objective:** Add standard HTTP security headers.

**Files:** package.json, src/app.js

**Steps:**
1. Install helmet
2. Add app.use(helmet()) before all route definitions in app.js

**Expected Result:** All responses include X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, etc.

---

### Task 8.3 — Strip Password from User Responses

**Objective:** Safety net to prevent password leaks in any API response.

**Files:** src/modules/auth/auth.model.js

**Steps:**
1. Add toJSON transform to userSchema options:
   - In the transform function: delete ret.password, return ret

**Expected Result:** Any user document serialized to JSON automatically has password removed.

---

## PHASE 9: Stats and Chart-Ready Endpoints

### Task 9.1 — Rental Overview Stats Endpoint

**Objective:** Dashboard-ready rental statistics.

**Files:** src/modules/rental/rental.service.js, src/modules/rental/rental.controller.js, src/modules/rental/rental.routes.js

**Steps:**
1. Add getStats() to service:
   - Count total, active, completed rentals
   - Aggregate totalRevenue from completed rentals using Rental.aggregate
2. Add getStats handler to controller
3. Add GET /stats route BEFORE /:id route in rental.routes.js

**Expected Result:** GET /api/rentals/stats returns { totalRentals, activeRentals, completedRentals, totalRevenue }.

---

### Task 9.2 — Monthly Revenue Chart Endpoint

**Objective:** Time-series revenue data for chart rendering.

**Files:** src/modules/rental/rental.service.js, src/modules/rental/rental.controller.js, src/modules/rental/rental.routes.js

**Steps:**
1. Add getMonthlyRevenue() to service:
   - Aggregate completed rentals grouped by { year: $year(endDate), month: $month(endDate) }
   - Sum totalAmount per group, count rentals per group
   - Sort by year ascending, then month ascending
2. Map results to { month: "YYYY-MM", revenue, count } format
3. Add controller handler and route at GET /stats/monthly

**Expected Result:** GET /api/rentals/stats/monthly returns array of monthly revenue objects.

---

### Task 9.3 — Product Utilization Stats Endpoint

**Objective:** Product demand/availability overview.

**Files:** src/modules/product/product.service.js, src/modules/product/product.controller.js, src/modules/product/product.routes.js

**Steps:**
1. Add getStats() to product service:
   - Find all active products
   - Map each to { _id, name, totalQuantity, availableQuantity, rentedQuantity, utilization% }
   - utilization = ((total - available) / total × 100), rounded to 1 decimal
2. Add controller handler and route at GET /stats BEFORE /:id

**Expected Result:** GET /api/products/stats returns utilization data per product.

---

## PHASE 10: Scalability and Advanced Features

### Task 10.1 — Flexible Item Lookup in Partial Return

**Objective:** Allow identifying rental items by productId as alternative to itemId.

**Files:** src/modules/rental/rental.service.js

**Steps:**
1. In partialReturn: after extracting data, also check for productId
2. If itemId provided → find item by _id
3. If only productId provided → find item where product matches productId AND remainingQuantity > 0
4. If neither matches → throw 404

**Expected Result:** Clients can use either { itemId } or { productId } to target an item for return.

---

### Task 10.2 — Bulk Partial Return Endpoint

**Objective:** Return multiple items in a single request.

**Files:** src/modules/rental/rental.service.js, src/modules/rental/rental.controller.js, src/modules/rental/rental.routes.js

**Steps:**
1. Add bulkReturn(rentalId, data) to service
2. data.returns = array of { itemId, returnQuantity, returnDate }
3. Find rental once, validate ACTIVE
4. Process each return entry against the in-memory rental document:
   - Same logic as partialReturn per entry
   - Restore stock to products as each entry is processed
5. Save rental ONCE at the end
6. Add controller handler and route at PATCH /:id/bulk-return

**Expected Result:** PATCH /api/rentals/:id/bulk-return processes multiple returns in one DB save.

---

### Task 10.3 — Live Rental Summary (Read-Only)

**Objective:** Preview what the bill would be if the rental were closed today.

**Files:** src/modules/rental/rental.service.js, src/modules/rental/rental.controller.js, src/modules/rental/rental.routes.js

**Steps:**
1. Add getSummary(rentalId) to service
2. Find and populate rental
3. If not ACTIVE, return rental as-is (already finalized)
4. If ACTIVE, for each item with remainingQuantity > 0:
   - projectedCharge = calculatePeriod(item.startDate, today, item.remainingQuantity, item.monthlyPrice)
   - Build per-item breakdown: { product, currentCharges: item.totalAmount, projectedAdditional, projectedTotal }
5. Sum for overall projectedTotal
6. Return rental data + projections — DO NOT modify database
7. Add controller handler and route at GET /:id/summary

**Expected Result:** GET /api/rentals/:id/summary returns real-time billing projection without side effects.

---

## Phase Dependencies

```
Phase 1 (1.1 → 1.2 → 1.3 → 1.4)         Auth — must complete before testing any protected route
Phase 2 (2.1 → 2.2 → 2.3 → 2.4)         Products — must exist before rentals can reference them
Phase 3 (3.1 → 3.2 → 3.3)               Model update → Create service → Read services
Phase 4 (4.1 → 4.2 → 4.3)               Splitter → Segment calc → Period calc (builds on each other)
Phase 5 (5.1)                             Requires Phase 3 (rental data) + Phase 4 (calc utilities)
Phase 6 (6.1)                             Requires Phase 4 (calc utilities)
Phase 7 (7.1 → 7.2, 7.3, 7.4, 7.5)      Create validate first, then apply to each module
Phase 8 (8.1, 8.2, 8.3)                  All independent of each other
Phase 9 (9.1 → 9.2, 9.3 independent)     9.2 extends 9.1 pattern; 9.3 is product-side
Phase 10 (10.1, 10.2, 10.3)              Requires Phase 5 + 6 complete
```

## Verification Strategy

**Phase 1:** Register user → Login → Use token on GET /api/products → Confirm 401 without token

**Phase 2:** Create product → GET all (verify listed) → GET by ID → Update totalQuantity (verify availableQuantity adjusts) → Delete (verify gone from list but in DB)

**Phase 3:** Create rental with 2 items → Verify each product's availableQuantity decreased → GET rental (verify product names populated)

**Phase 4:** Test calculatePeriod with known inputs:
- March 1–31, qty 2, price 3000 → expect 6000 (full month)
- March 10–25, qty 5, price 3000 → expect partial amount
- March 20–April 11, qty 3, price 3000 → expect split calculation

**Phase 5:** Create rental (March 1, 10 units) → Return 3 (March 10) → Verify:
- Charge = calculatePeriod(March 1, March 10, 3, price)
- item.remainingQuantity = 7
- item.startDate = March 10
- Product stock increased by 3

**Phase 6:** Close rental (April 15) → Verify:
- Final charge uses item.startDate (advanced by returns) → closeDate
- All stock restored
- Status = COMPLETED

**Phase 7:** POST /api/auth/register with empty body → 400 with field-level errors

**Phase 8:** Send 21 rapid POST /api/auth/login → Verify 429 on 21st

**Phase 9:** Create and close several rentals → GET /api/rentals/stats → Verify counts and revenue match

**Phase 10:** GET /api/rentals/:id/summary on active rental → Verify projected total matches manual calculation → Verify rental is NOT modified in DB
