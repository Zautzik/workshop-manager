# GonsAdmin - Complete File Documentation

## Project Overview
**GonsAdmin** is a comprehensive workshop management system built with Next.js, TypeScript, PostgreSQL, Supabase, and NextAuth. It provides role-based dashboards for admins, supervisors, managers, and technicians to manage machines, jobs, workers, inventory, and financial operations.

---

## System Architecture (Using Organism Analogy)

Think of the application like a human body with various organ systems:

| Component | Organ Analogy | Purpose |
|-----------|--------------|---------|
| **Configuration Files** | Skeleton | Structural framework for the app |
| **Authentication** | Immune System | Verifies identity and grants access |
| **Routing** | Nervous System | Directs users to correct pages |
| **Styling System** | Skin & Appearance | Visual design and theming |
| **State Management** | Circulatory System | Distributes data throughout app |
| **Database** | Organs | Store and retrieve data |
| **API Endpoints** | Postal Service | Communication between frontend/backend |

---

## Documented Files

### 🔧 Configuration Files (The "Skeleton")

#### [next.config.js](next.config.js)
- **Role**: Build & Runtime Configuration
- **What**: Configures Next.js behavior for production deployment
- **Affects**: Entire application's build process
- **Key features**: Standalone output for Docker, Turbopack bundler config

#### [tsconfig.json](tsconfig.json)
- **Role**: TypeScript Compiler & Type System Configuration
- **What**: Defines how TypeScript compiles code and type-checks
- **Affects**: All TypeScript files; enables strict type checking
- **Key feature**: Path alias `@/*` for clean imports

#### [tailwind.config.ts](tailwind.config.ts)
- **Role**: Styling System & Design Tokens
- **What**: Defines Tailwind CSS theme with color palette and animations
- **Affects**: All UI components; visual appearance
- **Key features**: Light/dark mode colors, role-specific colors (supervisor/manager)

#### [postcss.config.js](postcss.config.js)
- **Role**: CSS Processing Pipeline
- **What**: Chains Tailwind CSS and Autoprefixer for optimal CSS generation
- **Affects**: All CSS generation; browser compatibility

#### [src/index.css](src/index.css)
- **Role**: Design Tokens & Global Styles
- **What**: HSL color variables, accessibility utilities, theme definitions
- **Affects**: Visual appearance, keyboard navigation, screen reader support
- **Key sections**: Light/dark mode variables, sr-only, focus-visible, skip-to-content

---

### 📄 Page Routes (The "Entry Points")

#### Application Shell
- **[src/app/layout.tsx](src/app/layout.tsx)** - Root layout wrapping all pages
- **[src/app/providers.tsx](src/app/providers.tsx)** - Global state providers (Auth, Theme, Language, React Query)
- **[src/app/page.tsx](src/app/page.tsx)** - Home/login page

#### Dashboard Pages (Role-Based)
- **[src/app/admin/page.tsx](src/app/admin/page.tsx)** - Admin control center
  - System-wide statistics
  - User/worker/inventory management
  
- **[src/app/supervisor/page.tsx](src/app/supervisor/page.tsx)** - Supervisor management hub
  - Team performance monitoring
  - Job assignment and tracking
  
- **[src/app/manager/page.tsx](src/app/manager/page.tsx)** - Operations & strategy
  - Resource allocation
  - Budget and cost tracking
  
- **[src/app/financial/page.tsx](src/app/financial/page.tsx)** - Financial analytics
  - OT costs, machine costs, equipment investments
  - Budget vs. actual reports
  
- **[src/app/maintenance/page.tsx](src/app/maintenance/page.tsx)** - Equipment health
  - Maintenance schedules
  - Equipment uptime tracking
  
- **[src/app/workflow/page.tsx](src/app/workflow/page.tsx)** - Job orchestration
  - Job creation and assignment
  - Workflow progress tracking

#### Error Handling
- **[src/app/not-found.tsx](src/app/not-found.tsx)** - 404 error page

---

### 🔐 Authentication & Authorization (The "Immune System")

#### [src/lib/auth.ts](src/lib/auth.ts)
- **Role**: Authentication Engine & Session Management
- **What**: NextAuth.js configuration with credential provider
- **Affects**: User login, session creation, JWT tokens
- **Features**: 
  - Password verification via bcryptjs
  - Role fetching from database
  - JWT token enrichment with role data

#### [src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx)
- **Role**: User Identity & Authorization State
- **What**: React context providing authenticated user, role, and signin/signout
- **Affects**: All protected components; access control
- **Provides**: useAuth() hook for accessing user info

#### [src/types/app-role.ts](src/types/app-role.ts)
- **Role**: Role-Based Access Control Type Definition
- **What**: Union type defining all possible user roles
- **Roles**: supervisor | manager | admin | technician

#### [src/types/next-auth.d.ts](src/types/next-auth.d.ts)
- **Role**: Authentication Type Extensions
- **What**: TypeScript module augmentation for NextAuth types
- **Affects**: Type safety for user, session, and JWT data

---

### 🎨 Theming & Internationalization (The "Appearance & Communication")

#### [src/contexts/ThemeContext.tsx](src/contexts/ThemeContext.tsx)
- **Role**: UI Theme State Manager (Light/Dark Mode)
- **What**: Manages light/dark mode toggle with localStorage persistence
- **Affects**: All visual elements; respects CSS media queries
- **Provides**: useTheme() hook

#### [src/contexts/LanguageContext.tsx](src/contexts/LanguageContext.tsx)
- **Role**: Multi-Language Support Manager
- **What**: i18n system with 300+ English/Spanish translation keys
- **Affects**: All UI text throughout application
- **Provides**: useLanguage() hook with t() translation function

---

### 🔧 Utilities & Helpers (The "Tools")

#### [src/lib/utils.ts](src/lib/utils.ts)
- **Role**: CSS Class Utility
- **What**: cn() function for intelligent Tailwind class merging
- **Affects**: Component styling flexibility
- **Prevents**: Conflicting utility classes

#### [src/lib/navigation.ts](src/lib/navigation.ts)
- **Role**: Client-Side Navigation Helper
- **What**: Custom hooks abstracting Next.js routing
- **Provides**: useNavigate() and useLocation() for programmatic navigation

---

### 🪝 Custom Hooks (The "Specialized Tools")

#### [src/hooks/use-api.ts](src/hooks/use-api.ts)
- **Role**: HTTP Client / API Communication
- **What**: Custom hook providing typed methods: get, post, patch, put, delete
- **Affects**: All data fetching throughout app
- **Features**: Automatic JSON headers, error handling, session awareness

#### [src/hooks/use-mobile.tsx](src/hooks/use-mobile.tsx)
- **Role**: Responsive Design Detection
- **What**: Detects viewport size (mobile < 768px)
- **Affects**: Conditional rendering for responsive layouts
- **Usage**: Show/hide mobile menu, adjust layouts

#### [src/hooks/use-toast.ts](src/hooks/use-toast.ts)
- **Role**: Notification System Manager
- **What**: Toast notification queue with state management
- **Affects**: User feedback and alerts
- **Features**: Add, update, dismiss, auto-remove toasts

---

### 🧩 Page Components (The "Organs")

#### [src/page-components/Login.tsx](src/page-components/Login.tsx)
- **Role**: Authentication Entry Point (The "Front Gate")
- **What**: Login form with email/password fields
- **Features**: Theme toggle, language switcher, auto-redirect after login

#### [src/page-components/AdminDashboard.tsx](src/page-components/AdminDashboard.tsx)
- **Role**: Admin Control Panel (The "Command Center")
- **What**: Complete system administration interface
- **Includes**: Executive overview, user/worker/inventory/purchase management

#### [src/page-components/NotFound.tsx](src/page-components/NotFound.tsx)
- **Role**: Error Boundary (The "Lost & Found")
- **What**: User-friendly 404 page with navigation back home

---

### 📦 Admin Components

#### [src/components/admin/InventoryManagement.tsx](src/components/admin/InventoryManagement.tsx)
- **Role**: Material & Supply Inventory Controller (The "Warehouse")
- **What**: CRUD interface for inventory items
- **Data**: item_name, quantity, cost_per_unit
- **Features**: Add, edit, delete items with Supabase sync

---

## Database Schema Integration

The application interacts with these Supabase tables:

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| **users** | User accounts | id, email, name, password |
| **user_roles** | Role assignments | user_id, role, created_at |
| **machines** | Production equipment | id, name, type, status |
| **jobs** | Work orders | id, ot_number, status, machine_id |
| **workers** | Employee profiles | id, name, department |
| **task_logs** | Worker activity tracking | id, worker_id, task_type, time_spent |
| **rosters** | Team scheduling | id, name, created_at |
| **inventory** | Material supplies | id, item_name, quantity, cost_per_unit |
| **financial_tracking** | Cost tracking | id, type, amount, date |

---

## Data Flow Architecture

```
User Request
    ↓
[Login Page] → Authenticate via AuthContext
    ↓
[Role Check] → Route to role-specific dashboard
    ↓
[Dashboard] → useApi() hook for data fetching
    ↓
[API Route] → Process request, query database
    ↓
[Supabase] → Return data to client
    ↓
[Component] → Apply Theme/Language contexts
    ↓
[Rendered UI] → Display to user
```

---

## File Summary Table

| File | Type | System Role | Importance |
|------|------|------------|-----------|
| next.config.js | Config | Build Pipeline | Critical |
| tsconfig.json | Config | Type System | Critical |
| tailwind.config.ts | Config | Styling | High |
| postcss.config.js | Config | CSS Processing | Medium |
| src/index.css | Styles | Theme/Design | High |
| src/app/layout.tsx | Page | Root Shell | Critical |
| src/app/providers.tsx | Component | State Layer | Critical |
| src/app/page.tsx | Page | Entry Point | High |
| src/lib/auth.ts | Utility | Authentication | Critical |
| src/contexts/AuthContext.tsx | Context | Auth State | Critical |
| src/contexts/ThemeContext.tsx | Context | Theming | Medium |
| src/contexts/LanguageContext.tsx | Context | Internationalization | Medium |
| src/lib/utils.ts | Utility | CSS Helper | Low |
| src/lib/navigation.ts | Utility | Routing | Medium |
| src/hooks/use-api.ts | Hook | Data Fetching | High |
| src/hooks/use-mobile.tsx | Hook | Responsive | Medium |
| src/hooks/use-toast.ts | Hook | Notifications | Medium |
| Dashboard pages | Pages | UI/UX | High |
| Component files | Components | Features | Variable |

---

## Key Patterns & Conventions

### Authentication Flow
1. User submits email/password
2. AuthContext.signIn() calls Supabase
3. Password verified with bcryptjs
4. Role fetched from user_roles table
5. JWT token created with user ID and role
6. Automatic redirect based on role

### State Management
- **Global State**: Contexts (Auth, Theme, Language)
- **Server State**: React Query (for API data)
- **Form State**: useState (local component state)
- **URL State**: useRouter/usePathname (navigation)

### Styling Approach
- **Tokens**: CSS variables in index.css
- **Components**: Tailwind utility classes
- **Responsive**: useIsMobile hook for mobile checks
- **Dark Mode**: .dark class on html element

---

## Getting Started with the Codebase

### To Add a New Feature:
1. Create API route in `src/app/api/[feature]`
2. Create context if global state needed
3. Build components in `src/components/[feature]`
4. Create page in `src/app/[feature]/page.tsx`
5. Add to navigation with useLanguage() translations

### To Change Styling:
1. Modify CSS variables in `src/index.css`
2. Add Tailwind configs to `tailwind.config.ts`
3. Use cn() utility for conditional classes

### To Add New Languages:
1. Update `LanguageContext.tsx` translations object
2. Add language option to setLanguage selector

---

## Notes

- All files have detailed JSDoc comments explaining their role in the system
- The organ analogy helps understand each file's purpose
- Type safety is enforced through TypeScript and Zod
- Accessibility is built in (sr-only, focus-visible, semantic HTML)
- Multi-language and theme support are first-class features
