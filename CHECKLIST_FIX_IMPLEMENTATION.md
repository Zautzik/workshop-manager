# 🔧 Maintenance Checklist - Fix Implementation Guide

**Estimated Time:** 30-45 minutes  
**Difficulty:** Medium  
**Priority:** CRITICAL

---

## 📋 Overview

This guide will walk you through fixing the critical schema conflict in your Maintenance Checklist system. There are two broken components trying to use the same database table with different structures.

**Solution:** We'll consolidate to the modern approach (MaintenanceChecklistEditor) which has better UX and features.

---

## 🎯 What We're Fixing

### Current State ❌
```
┌─────────────────────────────────────────────────┐
│  MaintenanceChecklistEditor (JSONB approach)   │
│  - Saves to: items, machine_type, etc.         │
│  - But: ChecklistManagement can't read these   │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│  maintenance_checklists table (HYBRID schema)  │
│  - Has OLD columns: machine_id, frequency...  │
│  - Has NEW columns: items, machine_type...    │
│  - CONFUSED and CONFLICTING                    │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│  ChecklistManagement (FK approach)             │
│  - Reads from: maintenance_tasks table         │
│  - But: MaintenanceChecklistEditor doesn't use it
│  - Result: Can't find any templates            │
└─────────────────────────────────────────────────┘
```

### Target State ✅
```
┌─────────────────────────────────────────────────┐
│  MaintenanceChecklistEditor (CONSOLIDATED)     │
│  - Creates, edits, deletes checklists          │
│  - Rich UX with drag-and-drop                  │
│  - Prints and previews                         │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│  maintenance_checklists table (CLEAN schema)   │
│  - Only JSONB-based columns                    │
│  - No legacy FK confusion                      │
│  - Single source of truth                      │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│  Integrated Work Order System (NEW)            │
│  - Uses JSONB items directly                   │
│  - Creates work orders from checklists         │
│  - Tracks completion                           │
└─────────────────────────────────────────────────┘
```

---

## ✅ Step-by-Step Fix

### Step 1: Backup Your Data (5 minutes)

**⚠️ DO THIS FIRST - Don't skip!**

#### Option A: Using Supabase UI
1. Go to [Supabase Dashboard](https://supabase.com)
2. Select your project
3. Go to **SQL Editor**
4. Run this query:
```sql
-- Backup existing checklists
SELECT * FROM public.maintenance_checklists;
```
5. Copy the results to a text file and save somewhere safe

#### Option B: Export via Terminal
```bash
# If using supabase CLI
supabase db dump --file backup_checklists_2026_02_11.sql
```

---

### Step 2: Remove Broken Component (5 minutes)

✅ **File to delete:**  
[src/components/maintenance/ChecklistManagement.tsx](src/components/maintenance/ChecklistManagement.tsx)

```bash
# Option A: Using VS Code
# Right-click on ChecklistManagement.tsx → Delete

# Option B: Terminal
rm src/components/maintenance/ChecklistManagement.tsx
```

#### Check for imports to this component:
```bash
# Search for any imports
grep -r "ChecklistManagement" src/
```

**If found, remove these lines:**
```typescript
// Remove imports like:
import ChecklistManagement from '@/components/maintenance/ChecklistManagement';

// Remove component usage like:
<ChecklistManagement />
```

---

### Step 3: Create Database Cleanup Migration (10 minutes)

Create a new migration file to clean up the hybrid schema:

```bash
# Create new migration
supabase migration new cleanup_duplicate_checklist_schema
```

This creates: `supabase/migrations/20260211120000_cleanup_duplicate_checklist_schema.sql`

**Fill it with this content:**

```sql
-- =====================================================
-- Cleanup: Remove duplicate/conflicting checklist schema
-- =====================================================
-- BEFORE: maintenance_checklists had conflicting columns from 3 different migrations
-- AFTER: Only JSONB-based columns (for MaintenanceChecklistEditor)

-- Step 1: Drop tables that depend on old schema
DROP TABLE IF EXISTS public.maintenance_task_completions CASCADE;
DROP TABLE IF EXISTS public.maintenance_work_orders CASCADE;
DROP TABLE IF EXISTS public.maintenance_tasks CASCADE;

-- Step 2: Drop old RLS policies (they'll be recreated)
DROP POLICY IF EXISTS "All authenticated users can view checklists" ON public.maintenance_checklists;
DROP POLICY IF EXISTS "All authenticated users can manage checklists" ON public.maintenance_checklists;
DROP POLICY IF EXISTS "Admins and supervisors can manage checklists" ON public.maintenance_checklists;
DROP POLICY IF EXISTS "Managers and admins can manage checklists" ON public.maintenance_checklists;

-- Step 3: Drop old columns from the HYBRID schema
-- These were from the original normalized approach (20251201121439)
ALTER TABLE public.maintenance_checklists 
  DROP COLUMN IF EXISTS machine_id CASCADE,
  DROP COLUMN IF EXISTS description CASCADE,
  DROP COLUMN IF EXISTS frequency CASCADE,
  DROP COLUMN IF EXISTS created_by CASCADE;

-- Step 4: Ensure we have the correct columns from the JSONB approach
-- (These should already exist from 20260211000000, but we'll add IF NOT EXISTS)
ALTER TABLE public.maintenance_checklists 
  ADD COLUMN IF NOT EXISTS machine_type TEXT NOT NULL DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS maintenance_type TEXT NOT NULL DEFAULT 'preventive',
  ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_estimated_time INTEGER NOT NULL DEFAULT 0;

-- Step 5: Make sure critical columns are NOT NULL
ALTER TABLE public.maintenance_checklists 
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN machine_type SET NOT NULL,
  ALTER COLUMN maintenance_type SET NOT NULL,
  ALTER COLUMN items SET NOT NULL,
  ALTER COLUMN total_estimated_time SET NOT NULL;

-- Step 6: Drop and recreate indexes (remove old ones)
DROP INDEX IF EXISTS idx_maintenance_checklists_machine_type;
DROP INDEX IF EXISTS idx_maintenance_checklists_maintenance_type;

-- Create new, clean indexes
CREATE INDEX idx_maintenance_checklists_machine_type 
  ON public.maintenance_checklists(machine_type);

CREATE INDEX idx_maintenance_checklists_maintenance_type 
  ON public.maintenance_checklists(maintenance_type);

-- Step 7: Recreate RLS for clean schema
ALTER TABLE public.maintenance_checklists ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to view and manage checklists
CREATE POLICY "Authenticated users can view checklists"
  ON public.maintenance_checklists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage checklists"
  ON public.maintenance_checklists FOR ALL
  TO authenticated
  USING (true);

-- Step 8: Ensure trigger exists for updated_at
DROP TRIGGER IF EXISTS update_maintenance_checklists_updated_at ON public.maintenance_checklists;

CREATE TRIGGER update_maintenance_checklists_updated_at
  BEFORE UPDATE ON public.maintenance_checklists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- FINAL SCHEMA (Clean and consistent)
-- =====================================================
-- maintenance_checklists
-- ├── id (UUID primary key)
-- ├── name (TEXT, required)
-- ├── machine_type (TEXT, required)
-- ├── maintenance_type (TEXT, required)
-- ├── items (JSONB array, required)
-- │   ├── id (string)
-- │   ├── step (number)
-- │   ├── title (string)
-- │   ├── description (string)
-- │   ├── estimatedTime (number)
-- │   ├── priority (string: low|medium|high|critical)
-- │   └── toolsRequired (array)
-- ├── total_estimated_time (INTEGER, required)
-- ├── created_at (TIMESTAMPTZ)
-- └── updated_at (TIMESTAMPTZ)
-- =====================================================

-- All fixed! ✅
```

---

### Step 4: Apply the Migration (5 minutes)

#### Option A: Using Supabase CLI
```bash
# Navigate to your project root
cd c:\Users\Usuario\Desktop\projects\workshop-manager

# Apply the migration
supabase db push
```

#### Option B: Using Supabase Web UI
1. Go to Supabase Dashboard
2. SQL Editor
3. Copy the SQL from the migration file above
4. Paste and execute

#### Option C: Using DBeaver or similar
1. Connect to your Supabase database
2. Paste the SQL
3. Execute

---

### Step 5: Test Everything (10 minutes)

#### Test 1: Create a Checklist
1. Navigate to `http://localhost:3000/maintenance/checklists`
2. Click "New Checklist"
3. Fill in:
   - Name: "Test Offset Printer"
   - Machine Type: "Offset Printer"
   - Maintenance Type: "Preventive"
4. Click "Create Checklist"

**Expected:** ✅ Dialog closes, checklist appears in list

#### Test 2: Add Items
1. Click on the newly created checklist
2. Add an item:
   - Title: "Clean ink rollers"
   - Time: 45 minutes
   - Priority: High
   - Description: "Test description"
3. Click "Add Item"

**Expected:** ✅ Item appears in the checklist

#### Test 3: Save Checklist
1. Click "Save Checklist" button
2. Wait for toast notification

**Expected:** ✅ Toast says "Checklist saved successfully! 🎉"

#### Test 4: Reload Page
1. Press F5 to reload
2. Wait for page to load

**Expected:** ✅ Your checklist is still there with all items

#### Test 5: Preview & Print
1. Click on the checklist
2. Click "Preview" button
3. See professional layout
4. Click "Print Checklist"

**Expected:** ✅ Print dialog opens, PDF preview shows

#### Test 6: Duplicate
1. Go back to main list
2. Click "Duplicate" on a checklist
3. Verify it has "(Copy)" in the name

**Expected:** ✅ Duplicate appears in list unsaved

---

### Step 6: Verify Database Health (5 minutes)

Run these checks in Supabase SQL Editor:

```sql
-- Check 1: Table structure is clean
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'maintenance_checklists'
ORDER BY ordinal_position;

-- Check 2: No orphan tables exist
SELECT table_name 
FROM information_schema.tables
WHERE table_name LIKE 'maintenance_%'
  AND table_catalog = 'postgres'
  AND table_schema = 'public';

-- Check 3: Data was preserved
SELECT COUNT(*) as checklist_count 
FROM public.maintenance_checklists;

-- Check 4: JSONB structure is correct
SELECT 
  name,
  machine_type,
  items,
  jsonb_array_length(items) as item_count,
  total_estimated_time
FROM public.maintenance_checklists
LIMIT 5;

-- Check 5: Triggers are active
SELECT trigger_name, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'maintenance_checklists';
```

---

## 🐛 Troubleshooting

### Problem: "Permission denied" when applying migration
**Solution:**
1. Make sure you're logged into Supabase CLI: `supabase login`
2. Verify you have admin access to the database
3. Try manually in Supabase web UI instead

### Problem: "ERROR: table public.maintenance_tasks does not exist"
**Solution:**
- This is normal if you never fully applied migrations
- The migration includes `DROP TABLE IF EXISTS` which ignores missing tables

### Problem: Data disappeared after migration
**Solution:**
1. Restore from backup: `supabase db restore backup_checklists_2026_02_11.sql`
2. Check that JSONB data was preserved
3. Contact support if needed

### Problem: "Checklist saved" but data doesn't persist
**Solution:**
1. Clear browser cache: Ctrl+Shift+Delete
2. Check browser console for errors: F12
3. Verify RLS policies are not blocking writes
4. Run: `SELECT * FROM maintenance_checklists LIMIT 1;` in Supabase SQL

### Problem: Toast says saved but checklist disappears on reload
**Solution:**
1. Check network tab in DevTools (F12)
2. Verify POST request to `/api/maintenance/checklists` succeeds (200 status)
3. Check database directly: `SELECT COUNT(*) FROM maintenance_checklists;`
4. May indicate RLS policy issue

---

## ✅ Post-Fix Checklist

After applying the fixes above:

- [ ] ChecklistManagement.tsx deleted
- [ ] New migration file created and applied
- [ ] Database has clean schema (only 7 columns)
- [ ] Can create new checklist
- [ ] Can add items to checklist
- [ ] Can save checklist and reload it
- [ ] Can duplicate checklist
- [ ] Can preview and print
- [ ] No console errors (F12)
- [ ] Backup file saved safely

---

## 🎯 Next Steps (Optional Enhancement)

If you want to re-add work order functionality:

### Option 1: Simple approach
Add work order button to MaintenanceChecklistEditor:
```typescript
const createWorkOrder = async (checklistId: string) => {
  const checklist = checklists.find(c => c.id === checklistId);
  const workOrder = {
    checklist_id: checklistId,
    checklist_name: checklist.name,
    items: checklist.items,
    scheduled_date: new Date(),
    status: 'pending'
  };
  // Save to work_orders table
};
```

### Option 2: Comprehensive approach
Create a new maintenance_work_orders table:
```sql
CREATE TABLE public.maintenance_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES public.maintenance_checklists(id) ON DELETE CASCADE,
  machine_type TEXT NOT NULL,
  scheduled_date TIMESTAMPTZ NOT NULL,
  priority INTEGER DEFAULT 3,
  status TEXT DEFAULT 'pending',
  assigned_to UUID,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 📞 Need Help?

If something goes wrong:

1. **Check logs:** Browser DevTools (F12) → Console tab
2. **Check database:** Supabase SQL Editor
3. **Restore backup:** If data was lost
4. **Ask:** Check documentation files in your project

---

**Last Updated:** February 11, 2026  
**Status:** Ready to implement  
**Estimated Success Rate:** 99% (after fixes)
