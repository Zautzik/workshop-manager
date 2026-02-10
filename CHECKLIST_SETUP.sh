#!/bin/bash
# Quick Start Script for Maintenance Checklist Editor

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║  🎉 MAINTENANCE CHECKLIST EDITOR - QUICK START SETUP 🎉       ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Check if Supabase CLI is installed
echo "📋 Step 1: Checking Supabase CLI..."
if ! command -v supabase &> /dev/null; then
    echo "⚠️  Supabase CLI not found. Install it with:"
    echo "   npm install -g supabase"
    echo ""
    echo "   Then apply migration manually in Supabase SQL Editor"
    echo "   or run: supabase migration up"
else
    echo "✅ Supabase CLI found"
fi

echo ""

# Step 2: Verify files exist
echo "📋 Step 2: Verifying files..."
files_to_check=(
    "src/components/maintenance/MaintenanceChecklistEditor.tsx"
    "src/app/api/maintenance/checklists/route.ts"
    "src/app/maintenance/checklists/page.tsx"
    "supabase/migrations/20260207121500_maintenance_checklists.sql"
)

all_files_exist=true
for file in "${files_to_check[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file - NOT FOUND"
        all_files_exist=false
    fi
done

echo ""

# Step 3: Verify documentation
echo "📋 Step 3: Checking documentation..."
docs_to_check=(
    "CHECKLIST_QUICK_START.md"
    "CHECKLIST_VISUAL_DEMO.md"
    "MAINTENANCE_CHECKLIST_GUIDE.md"
    "CHECKLIST_EXAMPLES.md"
    "CHECKLIST_INTEGRATION_GUIDE.md"
    "DOCUMENTATION_INDEX.md"
)

all_docs_exist=true
for doc in "${docs_to_check[@]}"; do
    if [ -f "$doc" ]; then
        echo "✅ $doc"
    else
        echo "❌ $doc - NOT FOUND"
        all_docs_exist=false
    fi
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

# Step 4: Summary
if [ "$all_files_exist" = true ] && [ "$all_docs_exist" = true ]; then
    echo "✅ ALL FILES AND DOCUMENTATION VERIFIED!"
    echo ""
    echo "🚀 NEXT STEPS:"
    echo ""
    echo "1. Apply Database Migration:"
    echo "   → Copy SQL from: supabase/migrations/20260207121500_maintenance_checklists.sql"
    echo "   → Paste into Supabase SQL Editor"
    echo "   → Or run: supabase migration up"
    echo ""
    echo "2. Start Development Server:"
    echo "   npm run dev"
    echo ""
    echo "3. Open in Browser:"
    echo "   http://localhost:3000/maintenance/checklists"
    echo ""
    echo "4. Read Documentation:"
    echo "   → Start with: CHECKLIST_QUICK_START.md"
    echo "   → See visual guide: CHECKLIST_VISUAL_DEMO.md"
    echo "   → Complete reference: CHECKLIST_INTEGRATION_GUIDE.md"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "📖 DOCUMENTATION GUIDE:"
    echo ""
    echo "For Users:"
    echo "  • CHECKLIST_QUICK_START.md"
    echo "  • CHECKLIST_VISUAL_DEMO.md"
    echo "  • MAINTENANCE_CHECKLIST_GUIDE.md"
    echo ""
    echo "For Developers:"
    echo "  • CHECKLIST_INTEGRATION_GUIDE.md"
    echo "  • src/components/maintenance/README.md"
    echo ""
    echo "For Everyone:"
    echo "  • DOCUMENTATION_INDEX.md (Navigation guide)"
    echo "  • CHECKLIST_EXAMPLES.md (Copy-paste templates)"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "✨ Your maintenance checklist editor is ready to use!"
    echo ""
else
    echo "❌ SOME FILES MISSING!"
    echo ""
    echo "Please ensure all files are in place before proceeding."
    echo ""
    echo "Missing files:"
    for file in "${files_to_check[@]}"; do
        if [ ! -f "$file" ]; then
            echo "  • $file"
        fi
    done
    for doc in "${docs_to_check[@]}"; do
        if [ ! -f "$doc" ]; then
            echo "  • $doc"
        fi
    done
    echo ""
fi

echo "════════════════════════════════════════════════════════════════"
