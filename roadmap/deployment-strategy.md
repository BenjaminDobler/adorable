# Deployment Strategy: GitHub Pages + Render

This document outlines the plan to deploy the application using a split architecture:
- **Frontend:** Hosted on **GitHub Pages** (Static Site Hosting).
- **Backend:** Hosted on **Render.com** (Node.js API + PostgreSQL Database).

## 1. Architecture Overview

### Frontend (GitHub Pages)
- **Build Artifact:** `dist/apps/client` (Angular).
- **Hosting:** served statically via `gh-pages` branch or GitHub Actions.
- **Configuration:** Needs to point to the Render API URL instead of `localhost:3333`.

### Backend (Render.com)
- **Service Type:** Web Service (Node.js).
- **Database:** Managed PostgreSQL (provided by Render or external).
- **Configuration:**
    - `DATABASE_URL`: Connection string to PostgreSQL.
    - `CORS`: Must allow requests from the GitHub Pages domain (e.g., `https://username.github.io`).
    - `JWT_SECRET`, `API_KEYS`: Securely set in Render Environment Variables.

---

## 2. Database Migration (SQLite -> PostgreSQL)

The current local development uses SQLite. Render requires PostgreSQL for persistent storage.

### Option A: Start Fresh (Recommended for Prototype)
1. Provision a PostgreSQL database on Render.
2. Update `prisma/schema.prisma` to use `provider = "postgresql"`.
3. Run `npx prisma db push` against the new database to create the schema.
4. **Result:** A clean, empty database in production. Local data is *not* transferred.

### Option B: Migrate Data
If existing local data must be preserved:
1. **Dump SQLite Data:** Use a tool (like `sqlite3 .dump` or DBeaver) to export data to SQL.
2. **Transform:** Convert SQLite-specific SQL to PostgreSQL-compatible SQL (syntax differences exist).
3. **Import:** Run the SQL script against the new Postgres database.
*Note: This process can be error-prone due to SQL dialect differences.*

---

## 3. Required Code Changes

### Server (`apps/server`)
1.  **CORS Configuration:**
    Update `main.ts` to accept the production frontend origin.
    ```typescript
    const allowedOrigins = [
      'http://localhost:4200', 
      'https://your-username.github.io' // Add production URL
    ];
    app.use(cors({ origin: allowedOrigins }));
    ```

2.  **Prisma Schema:**
    Switch provider to PostgreSQL.
    ```prisma
    datasource db {
      provider = "postgresql" // Was "sqlite"
      url      = env("DATABASE_URL")
    }
    ```

### Client (`apps/client`)
1.  **Environment Variables:**
    Ensure `src/environments/environment.prod.ts` (or similar) points to the Render API.
    ```typescript
    export const environment = {
      production: true,
      apiUrl: 'https://your-app-name.onrender.com/api'
    };
    ```

---

## 4. Deployment Steps

### Step 1: Deploy Server to Render
1.  Push code to GitHub.
2.  Create **Web Service** on Render connected to the repo.
3.  **Build Command:** `npm install && npx nx build server`
4.  **Start Command:** `node dist/apps/server/main.js`
5.  **Environment Variables:** Add `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, etc.

### Step 2: Deploy Client to GitHub Pages
1.  **Build:** `npx nx build client --configuration=production`
2.  **Deploy:** Use the `angular-cli-ghpages` package or a GitHub Action.
    ```bash
    npx angular-cli-ghpages --dir=dist/apps/client/browser
    ```
