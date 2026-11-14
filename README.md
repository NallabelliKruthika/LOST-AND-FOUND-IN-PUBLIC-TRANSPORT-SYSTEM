# Lost & Found in Public Transport (Problem Statement 24)

Stack: HTML/CSS/JS · Node.js + Express · MongoDB (Mongoose) · Multer · JWT auth

## Run
1. Install Node.js (v18+) and MongoDB Community (running on localhost:27017), or put a MongoDB Atlas URI in `.env`.
2. In this folder:
   ```
   npm install
   npm run seed      # creates admin + demo user
   npm start
   ```
3. Open http://localhost:3000

## Logins (created by `npm run seed`)
- Admin: admin@transit.com / admin123
- Passenger: user@transit.com / user123 (or register new passengers)

## Demo flow
1. Register two passengers (use two browsers / one incognito).
2. Passenger A: Report Lost -> Wallet, "blue leather wallet", "City Bus Depot".
3. Passenger B: Report Found -> Wallet, "blue wallet leather", "City Bus Depot". A match notification appears for both.
4. Passenger A: My Dashboard -> View matches -> Claim.
5. Admin: Pending Claims -> Approve. Both users are notified and reports become Claimed.

## Matching logic (matcher.js)
Score out of 100: category 40 + location keyword overlap 25 + description keyword overlap 25 + date within 3 days 10 (5 within 7 days).
Reports scoring 50 or more are suggested as matches.

## API
POST /api/auth/register, /api/auth/login · POST /api/reports/lost, /found (multipart, `image`) · GET /api/reports (admin) ·
GET /api/reports/mine, /search?query= , /matches/:id · PUT /api/reports/:id, /:id/status (admin) · DELETE /api/reports/:id ·
POST /api/claims · GET /api/claims · PUT /api/claims/:id/approve, /reject (admin) · GET /api/notifications · GET /api/admin/stats
