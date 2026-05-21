# Quick Start Guide - PostgreSQL Setup

This is a quick guide to get your GonsAdmin application running with PostgreSQL.

## 🚀 Quick Setup (5 minutes)

### 1. Install PostgreSQL

**Option A - macOS (Homebrew):**

```bash
brew install postgresql@15
brew services start postgresql@15
createdb gonsadmin
```

**Option B - Docker (All platforms):**

```bash
docker run --name gonsadmin-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=gonsadmin \
  -p 5432:5432 \
  -d postgres:15
```

### 2. Configure Environment

Create `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and update the database URL:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/gonsadmin?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="run: openssl rand -base64 32"
```

### 3. Set Up Database

### 4. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` and login with:

> **Warning:** The credentials below are seed data for local development only. Change all passwords before deploying to any shared or production environment.

- **Admin:** admin@gonsadmin.app / admin123
- **Supervisor:** supervisor@gonsadmin.app / supervisor123

## 📚 Useful Commands

```bash
# Development
npm run dev                # Start dev server
npm run build              # Build for production
npm run start              # Start production server
```

## 🔧 What Changed?

### ✅ Installed

- PostgreSQL client (`pg`)
- NextAuth.js (`next-auth`)
- Password hashing (`bcryptjs`)

### ✅ Created

- `/src/lib/auth.ts` - NextAuth configuration
- `/src/app/api/auth/[...nextauth]/route.ts` - Auth API
- `/src/app/api/machines/` - Machine CRUD APIs
- `/src/app/api/jobs/` - Job CRUD APIs
- `/src/app/api/workers/` - Worker CRUD APIs

### ✅ Updated

- `AuthContext.tsx` - Uses NextAuth instead of Supabase
- `providers.tsx` - Wrapped with SessionProvider

## 🗄️ Database Schema

Your database includes:

- **Users & UserRoles** - Authentication & role-based access
- **Machines** - Production equipment
- **Jobs** - Work orders
- **Workers** - Staff management
- **TaskLogs** - Worker activity tracking
- **Rosters** - Team scheduling
- **Workstations & Shifts** - Workspace allocation
- **Financial Tables** - OT costs, machine costs, investments

## 🔐 API Routes

All API routes require authentication. Role restrictions apply:

- `/api/machines` - GET (all), POST (supervisor/admin)
- `/api/machines/[id]` - GET, PATCH (supervisor/admin), DELETE (admin)
- `/api/jobs` - GET (all), POST (supervisor/admin)
- `/api/workers` - GET (all), POST (supervisor/admin)

## 📖 Next Steps

1. Update your component code to use API routes instead of Supabase
2. Test all features thoroughly
3. Remove Supabase dependencies when ready

## ❓ Troubleshooting

**Can't connect to database?**

- Check PostgreSQL is running: `brew services list` (macOS) or `docker ps` (Docker)
- Verify `DATABASE_URL` in `.env` matches your setup

**Authentication not working?**

- Ensure `NEXTAUTH_SECRET` is set in `.env`
- Check you seeded the database with test users

## 🆘 Need Help?

- Supabase Docs: https://supabase.com/docs
- NextAuth Docs: https://next-auth.js.org
- PostgreSQL Docs: https://www.postgresql.org/docs/
