# Blackjack Bankroll Tracker

Professional full-stack bankroll tracker for daily blackjack session management.

## Tech Stack

- Frontend: React + Tailwind CSS + Recharts
- Backend: Node.js + Express
- Database: SQLite (better-sqlite3)
- Auth: Local JWT login/register
- Export: CSV + Excel
- Backup/Restore: SQLite file backup upload/download

## Included Features

- Login + register (local account)
- Dashboard KPIs
  - Current Balance
  - Total Withdrawn
  - Total Value
  - Today Target
  - Today Stop Loss
  - Today Profit Goal
  - Days Played
  - Days Won/Lost
  - ROI
- Daily entry with automatic calculations
  - End balance
  - Suggested withdrawal
  - Next day unit size
  - Next day stop loss
  - Next day profit target
- History page with filters and deletion
- Analytics page with charts
  - Balance growth line
  - Withdrawals bars
  - Daily P/L bars
  - Monthly summary bars
  - Win/Loss pie
- Goal tracker for yearly target progress
- Settings page for risk model and theme value persistence
- CSV export and Excel export
- Database backup and restore
- Sample seed data

## Business Logic

- Unit Size = bankroll x 1%
- Stop Loss = bankroll x stop_loss_percent
- Profit Goal = bankroll x profit_target_percent
- Suggested Withdrawal = bankroll x withdrawal_percent
- Total Value = current_balance + total_withdrawn

Safety checks:
- Duplicate date per user blocked
- Negative end balance blocked
- API payload validation with zod

## Project Structure

- client: React UI
- server: Express API + auth + business logic
- database: SQLite schema + backup folder
- components: reserved shared assets/docs
- pages: reserved docs
- utils: reserved docs

## Quick Start

### 1) Install dependencies

From project root:

```bash
npm install
npm install --prefix server
npm install --prefix client
```

### 2) Configure backend env

```bash
copy server\.env.example server\.env
```

### 3) Seed sample data

```bash
npm run seed
```

Demo user:
- username: demo
- password: demo1234

### 4) Run app

```bash
npm run dev
```

- API: http://localhost:4000
- Frontend: http://localhost:5173

## API Routes

- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- GET /api/dashboard
- GET /api/summary/daily
- GET /api/analytics
- GET /api/sessions
- POST /api/sessions
- DELETE /api/sessions/:id
- GET /api/settings
- PUT /api/settings
- GET /api/export/csv
- GET /api/export/excel
- GET /api/backup/download
- POST /api/backup/restore

## Production Notes

- Replace JWT secret in server/.env
- Run frontend build via npm run build
- Serve client/dist through static hosting or reverse proxy
- Keep database backup schedule and store backups outside project directory

## Deploy On Render

This repository includes a Render blueprint file at [render.yaml](render.yaml) for one-click setup.

### Steps

1. Push this project to GitHub.
2. In Render, choose New + and click Blueprint.
3. Select your repository.
4. Render will detect [render.yaml](render.yaml) and create the web service.
5. After deploy completes, open your Render URL.

### What This Deploy Does

- Runs only the Express service on Render.
- Serves the frontend from server static files (same domain).
- API health endpoint: /api/health

### Required Env Vars (Handled In Blueprint)

- NODE_ENV=production
- JWT_SECRET generated automatically
- DB_PATH=../../database/blackjack_tracker.db

### Free Tier Reality Check

- Render free web services can sleep after inactivity.
- This means it is not true guaranteed 24/7 always-on uptime on the free tier.
- SQLite data on free instances is not durable across all restarts/redeploys.

For reliable always-on behavior and durable storage, move to a paid Render plan and use a persistent disk or managed database.

## Desktop Option

Electron can wrap this app as a desktop shell without changing backend business logic. The web app is already responsive for desktop and mobile browser use.
