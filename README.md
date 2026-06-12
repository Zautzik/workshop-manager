# GonsAdmin

A comprehensive workshop operations platform built with Next.js, TypeScript, PostgreSQL, Supabase, and NextAuth.

## 📚 Documentation

- **[SETUP.md](./SETUP.md)** - 5-minute quick start guide

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# 3. Apply database migrations
npx supabase db push

# 4. Start development server
npm run dev
```

**First login:** seed your initial admin account with the offline script — no password is hardcoded in source control:

```bash
SEED_ADMIN_PASSWORD="<choose-a-strong-password>" npx tsx scripts/seed-admin.ts
```

## Error Tracking (Sentry)

Sentry is integrated for client, server, and edge runtime errors.

Set these variables in `.env` to enable capture:

```env
NEXT_PUBLIC_SENTRY_DSN="<dsn-from-sentry-project>"
SENTRY_DSN="<optional-server-dsn-override>"
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="0.1"
SENTRY_TRACES_SAMPLE_RATE="0.1"
SENTRY_ENVIRONMENT="development"
```

Optional CI/CD source map upload:

```env
SENTRY_AUTH_TOKEN="<token>"
SENTRY_ORG="<org-slug>"
SENTRY_PROJECT="<project-slug>"
```

## Dev Bypass Safety Note

When `NEXT_PUBLIC_DEV_BYPASS=true` in development, maintenance dashboard hooks use local mock data rather than relying on anon database read policies.
Do not add anon SELECT policies for maintenance tables in shared environments.

`NEXT_PUBLIC_DEV_BYPASS` is development-only and must stay `false` in production/staging.
The app now fails fast if `NEXT_PUBLIC_DEV_BYPASS=true` is present in a non-development build, and CI scans the standalone output to ensure dev bypass code is not bundled.

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL via Supabase
- **Authentication**: NextAuth.js
- **UI Components**: Radix UI
- **Styling**: Tailwind CSS
- **State Management**: React Query
- **Forms**: React Hook Form + Zod

## 📦 Scripts

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint
```

## 🏗️ Project Structure

```
gonsadmin/

├── src/
│   ├── app/            # Next.js app router pages
│   ├── components/     # React components
│   ├── contexts/       # React contexts
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utilities & configs
│   ├── types/          # TypeScript types
│   └── i18n/           # Internationalization
├── public/             # Static assets
└── supabase/           # Migrations, seeds, and edge functions
```

## 🎯 Features

- 🔐 **Authentication** - Role-based access control (Admin, Supervisor, Manager, Technician)
- 🏭 **Machine Management** - Track equipment status and maintenance
- 📋 **Job Tracking** - Manage work orders and assignments
- 👷 **Worker Management** - Employee tracking and performance
- 📅 **Roster Scheduling** - Shift planning and workstation assignments
- 💰 **Financial Tracking** - OT costs, machine costs, equipment investments
- 📊 **Dashboards** - Role-specific views and analytics
- 🌐 **Multi-language** - Support for multiple languages

---

## Project Info

This project uses Supabase (PostgreSQL) for database management.
