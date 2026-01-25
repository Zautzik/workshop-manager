# GonsAdmin - Workshop Management System

A comprehensive workshop management system built with Next.js, TypeScript, PostgreSQL, Supabase, and NextAuth.

## 📚 Documentation

- **[SETUP.md](./SETUP.md)** - 5-minute quick start guide
- **[CHECKLIST.md](./CHECKLIST.md)** - Complete setup checklist

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials



# 4. Start development server
npm run dev
```

**Default Login:**

- Admin: `admin@gonsadmin.com` / `admin123`
- Supervisor: `supervisor@gonsadmin.com` / `supervisor123`

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL
- **Database**: Supabase (PostgreSQL)
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
GonsAdmin/

├── src/
│   ├── app/            # Next.js app router pages
│   ├── components/     # React components
│   ├── contexts/       # React contexts
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utilities & configs
│   ├── types/          # TypeScript types
│   └── i18n/           # Internationalization
├── public/             # Static assets
└── supabase/           # (Legacy - kept for reference)
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

## Original Project Info

**Lovable Project URL**: https://lovable.dev/projects/e0be18ac-d7d9-48ca-86f2-dad2bd003304

This project was originally built with Lovable and now uses Supabase (PostgreSQL) for database management.
