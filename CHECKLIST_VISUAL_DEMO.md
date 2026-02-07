# 🎬 Maintenance Checklist Editor - Visual Demo Guide

## Overview

This guide walks you through the Maintenance Checklist Editor interface with descriptions of what you'll see at each step.

---

## 🏠 Main View

When you first open `/maintenance/checklists`, you'll see:

```
╔════════════════════════════════════════════════════════════════╗
║  Maintenance Checklists                                        ║
║  Create and manage detailed maintenance procedures             ║
║                                  [+ New Checklist] Button      ║
╚════════════════════════════════════════════════════════════════╝

┌─────────────────────┬─────────────────────┬─────────────────────┐
│  Offset Printer     │  Guillotine Safety  │  Digital Printer    │
│  Monthly Maint.     │  & Maintenance      │  Quarterly Insp.    │
│                     │                     │                     │
│ Offset Printer      │ Guillotine          │ Digital Printer     │
│ 5 items             │ 4 items             │ 4 items             │
│ ⏱️ 165 min          │ ⏱️ 155 min          │ ⏱️ 80 min           │
│ Preventive          │ Preventive          │ Inspection          │
│                     │                     │                     │
│ [Duplicate] [✕]     │ [Duplicate] [✕]     │ [Duplicate] [✕]     │
└─────────────────────┴─────────────────────┴─────────────────────┘

No checklists yet? [Create Your First Checklist]
```

---

## ➕ Create New Checklist Dialog

Click "New Checklist" and you'll see:

```
╔═══════════════════════════════════════════════╗
║  Create New Maintenance Checklist             ║
║  Set up a new maintenance checklist for       ║
║  equipment or machines                        ║
╠═══════════════════════════════════════════════╣
║                                               ║
║  Checklist Name *                             ║
║  ┌─────────────────────────────────────────┐  ║
║  │ e.g., Offset Printer Monthly...        │  ║
║  └─────────────────────────────────────────┘  ║
║                                               ║
║  Machine/Equipment Type *                     ║
║  ┌─────────────────────────────────────────┐  ║
║  │ e.g., Offset Printer, Guillotine...    │  ║
║  └─────────────────────────────────────────┘  ║
║                                               ║
║  Maintenance Type                             ║
║  ┌─────────────────────────────────────────┐  ║
║  │ [Preventive              ▼]             │  ║
║  └─────────────────────────────────────────┘  ║
║     • Preventive                              ║
║     • Corrective                              ║
║     • Emergency                               ║
║     • Inspection                              ║
║     • Cleaning                                ║
║                                               ║
║                                               ║
║          [Cancel]  [Create Checklist]         ║
╚═══════════════════════════════════════════════╝
```

---

## ✏️ Checklist Editor View

After creating a checklist, you enter the editor:

```
╔════════════════════════════════════════════════════════════════╗
║  Offset Printer - Monthly Maintenance                          ║
║  Machine: Offset Printer | [Preventive Badge]                 ║
║                                [Preview] [Back] [Save ✓]       ║
╚════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────┐
│  ➕ Add New Item                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Item Title *                    Estimated Time (minutes) *    │
│  ┌──────────────────────────┐   ┌──────────────────────────┐  │
│  │ Clean ink rollers       │   │ 45                       │  │
│  └──────────────────────────┘   └──────────────────────────┘  │
│                                                                 │
│  Description                                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Carefully clean all ink rollers with appropriate       │  │
│  │ solvent. Remove any dried ink or debris.               │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Priority              Tools Required                           │
│  ┌──────────────────┐  ┌────────────────────────────────────┐ │
│  │ [High       ▼]  │  │ Wrench, Screwdriver      [Add]     │ │
│  └──────────────────┘  └────────────────────────────────────┘ │
│     • Low                 [🏷️ Wrench] [🏷️ Screwdriver]       │
│     • Medium                                                    │
│     • High                                                      │
│     • Critical                                                  │
│                                                                 │
│                     [Add Item]                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Checklist Items (5)                  Total Time: 165 min       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ⊞ [1] Clean ink rollers            [HIGH Badge] [Edit] [✕]  │
│      Carefully clean all ink rollers...                        │
│      ⏱️ 45 min    Tools: Solvent, Cloth                        │
│                                                                 │
│  ⊞ [2] Check water fountain           [HIGH Badge] [Edit] [✕]  │
│      Verify water level and pH balance...                      │
│      ⏱️ 30 min    Tools: pH meter                              │
│                                                                 │
│  ⊞ [3] Oil all moving parts        [MEDIUM Badge] [Edit] [✕]  │
│      Apply light machine oil to pivot points...                │
│      ⏱️ 30 min    Tools: Oil, Oil can                          │
│                                                                 │
│  ⊞ [4] Inspect gripper pads          [HIGH Badge] [Edit] [✕]  │
│      Check pads for wear and replace if needed...              │
│      ⏱️ 40 min    Tools: Pads, Wrench set                      │
│                                                                 │
│  ⊞ [5] Test print quality         [MEDIUM Badge] [Edit] [✕]   │
│      Run test prints to verify color and registration...       │
│      ⏱️ 20 min    Tools: Test stock                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔘 Dragging Items

Hover over an item and grab the handle on the left:

```
BEFORE:
┌──────────────────────────────────────┐
│ ⊞ [1] Clean ink rollers              │
│ ⊞ [2] Check water fountain  ← Item 2 │
│ ⊞ [3] Oil all moving parts           │
│ ⊞ [4] Inspect gripper pads           │
└──────────────────────────────────────┘

DRAGGING:
┌──────────────────────────────────────┐
│ ⊞ [1] Clean ink rollers              │
│ ⊞ [4] Inspect gripper pads           │
│ ⊞ [2] Check water fountain ← Moving! │
│ ⊞ [3] Oil all moving parts           │
└──────────────────────────────────────┘

AFTER:
┌──────────────────────────────────────┐
│ ⊞ [1] Clean ink rollers              │
│ ⊞ [2] Inspect gripper pads (was #4)  │
│ ⊞ [3] Check water fountain (was #2)  │
│ ⊞ [4] Oil all moving parts (was #3)  │
└──────────────────────────────────────┘
```

Step numbers and totals recalculate automatically! ✨

---

## 👁️ Preview Mode

Click "Preview" to see the print-ready version:

```
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║          OFFSET PRINTER - MONTHLY MAINTENANCE                 ║
║                                                                ║
║  Machine: Offset Printer | Maintenance: Preventive            ║
║                                                                ║
║  5 Steps | 165 Minutes | Last Updated: 2/7/2026              ║
║                                                                ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  ╔═ STEP 1 ═══════════════════════════════════════════════╗  ║
║  ║ Clean ink rollers                          [HIGH]      ║  ║
║  ║ ────────────────────────────────────────────────────── ║  ║
║  ║ Carefully clean all ink rollers with                  ║  ║
║  ║ appropriate solvent. Remove any dried                 ║  ║
║  ║ ink or debris.                                        ║  ║
║  ║                                                       ║  ║
║  ║ ⏱️ 45 min | Tools: Solvent, Cloth                    ║  ║
║  ║ ☑ Completed                                          ║  ║
║  ╚═══════════════════════════════════════════════════════╝  ║
║                                                                ║
║  ╔═ STEP 2 ═══════════════════════════════════════════════╗  ║
║  ║ Check water fountain                     [HIGH]       ║  ║
║  ║ ... (similar format) ...                              ║  ║
║  ╚═══════════════════════════════════════════════════════╝  ║
║                                                                ║
║  ... (steps 3, 4, 5 in same format) ...                      ║
║                                                                ║
╠════════════════════════════════════════════════════════════════╣
║  Technician: _________________________                         ║
║  Date: _________________________                              ║
║  Notes: ___________________________________                   ║
╠════════════════════════════════════════════════════════════════╣
║        [🖨️ Print Checklist]  [💾 Save & Close]               ║
╚════════════════════════════════════════════════════════════════╝
```

---

## 🖨️ Print Output

Click "Print" and you get a PDF-ready document:

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│    OFFSET PRINTER - MONTHLY MAINTENANCE             │
│                                                      │
│  Machine: Offset Printer                            │
│  Type: Preventive                                   │
│                                                      │
│  5 Steps | 165 Minutes | Feb 7, 2026               │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Step 1: Clean ink rollers [HIGH PRIORITY]          │
│  ────────────────────────────────────────            │
│  Carefully clean all ink rollers with               │
│  appropriate solvent. Remove any dried ink.         │
│                                                      │
│  ⏱️ 45 minutes                                       │
│  Tools: Solvent, Cloth, Soft brush                  │
│                                                      │
│  ☐ Completed                                        │
│                                                      │
│                                                      │
│  Step 2: Check water fountain [HIGH PRIORITY]       │
│  ────────────────────────────────────────            │
│  ... (continues for all steps) ...                  │
│                                                      │
├──────────────────────────────────────────────────────┤
│  Technician Signature: ____________                 │
│  Date: ____________                                 │
│  Notes/Issues Found:                                │
│  ________________________________________            │
│  ________________________________________            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Perfect for printing and filing! 📋

---

## 🔄 Priority Color Coding

Colors help you quickly identify important steps:

```
🔵 LOW PRIORITY (Blue)
   Optional maintenance, nice-to-have tasks
   Example: "Check for dust buildup"

🟡 MEDIUM PRIORITY (Yellow)
   Important routine tasks
   Example: "Apply light machine oil"

🟠 HIGH PRIORITY (Orange)
   Critical for equipment health
   Example: "Replace worn parts"

🔴 CRITICAL PRIORITY (Red)
   Safety-related, must-do items
   Example: "Test emergency stop button"
```

---

## 📊 Checklist Card View

When you return to main view, each checklist shows:

```
┌─────────────────────────────────┐
│  Offset Printer Monthly         │
│  Maintenance                    │
├─────────────────────────────────┤
│                                 │
│  Machine:                       │
│  Offset Printer                 │
│                                 │
│  5 items | 165 min total        │
│  [Preventive]                   │
│                                 │
│ [Duplicate] [Delete]            │
│                                 │
└─────────────────────────────────┘
```

Click the card to edit, or use buttons for actions.

---

## ✏️ Editing an Item

Click "Edit" on an item and the form fills in:

```
┌─────────────────────────────────────────────────────┐
│  ✏️ Edit Checklist Item                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Item Title *                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │ Clean ink rollers                       ✓ Filled│ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  Description                                        │
│  ┌────────────────────────────────────────────────┐ │
│  │ Carefully clean all ink rollers...     ✓ Filled│ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  Estimated Time: 45 ✓ Filled                        │
│  Priority: [High ▼] ✓ Filled                        │
│                                                     │
│  Tools: [Wrench] [Screwdriver] ✓ Filled            │
│                                                     │
│              [Update Item]                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Make your changes and click "Update Item" ✨

---

## 🗑️ Deleting Items

Click the delete (✕) button:

```
Confirmation Toast:
┌──────────────────────┐
│ ✓ Item removed       │
└──────────────────────┘

Item immediately disappears from list.
Steps renumber automatically.
Total time recalculates.
```

---

## 💾 Saving Checklist

Click "Save Checklist" button:

```
Success Toast:
┌────────────────────────────────────┐
│ ✓ Checklist saved successfully! 🎉 │
└────────────────────────────────────┘

- Data persists to Supabase
- Timestamp updated automatically
- Ready for future use
- Can be duplicated
```

---

## 🔁 Duplicating a Checklist

Click "Duplicate" on a card:

```
Before:
Offset Printer Monthly Maintenance
Digital Printer Quarterly Inspection

After:
Offset Printer Monthly Maintenance
Offset Printer Monthly Maintenance (Copy)  ← New!
Digital Printer Quarterly Inspection

Success Toast:
┌──────────────────────┐
│ ✓ Checklist copied   │
└──────────────────────┘
```

Edit the copy to customize for your needs!

---

## 🗑️ Deleting a Checklist

Click the delete button (✕) on a card:

```
Before:
┌─────────────────┐  ┌─────────────────┐
│ Checklist A     │  │ Checklist B     │
│ [Dup] [✕]       │  │ [Dup] [✕]       │
└─────────────────┘  └─────────────────┘

After clicking ✕:
┌─────────────────┐
│ Checklist B     │
│ [Dup] [✕]       │
└─────────────────┘

Toast:
┌──────────────────────┐
│ ✓ Checklist deleted  │
└──────────────────────┘
```

---

## 🎯 Complete Workflow

### 1. Create
```
[New Checklist] → Fill form → [Create]
```

### 2. Add Items
```
Fill form → [Add Item] → Repeat → Item appears in list
```

### 3. Organize
```
Drag items → Steps renumber → Total time updates
```

### 4. Review
```
[Preview] → Check layout → Looks good!
```

### 5. Print
```
[Print Checklist] → Save as PDF → Share with team
```

### 6. Save
```
[Save Checklist] → Toast confirms → Done!
```

### 7. Reuse
```
[Duplicate] → Modify → [Save] → New checklist ready
```

---

## 🎨 Color & Design Elements

```
Primary Buttons: Cyan/Blue
  - New Checklist
  - Add Item
  - Save Checklist

Secondary Buttons: Gray
  - Back, Preview, Edit

Danger Buttons: Red
  - Delete

Success: Green
  - Save confirmation

Icons: Lucide React
  - ➕ Add
  - ✏️ Edit
  - 🗑️ Delete
  - 👁️ Preview
  - 💾 Save
  - 🖨️ Print
  - ⏱️ Time
  - 🏷️ Tools
```

---

## ✨ Visual Feedback

- **Toast Notifications** - Confirm every action
- **Color Badges** - Show priority levels
- **Icons** - Quick visual reference
- **Step Numbers** - Auto-numbered circles
- **Time Display** - Shows minute estimates
- **Tool Tags** - Visual tool requirements
- **Hover Effects** - Interactive feedback
- **Loading States** - Smooth transitions

---

## 📱 Mobile View

On mobile devices:

```
One-column layout
┌──────────────────┐
│  Checklist       │
│  Card Stack      │
│                  │
│  [New] Button    │
│  Fixed at top    │
└──────────────────┘

Full-width inputs
Full-width buttons
Touch-friendly drag
All features available
```

---

## 🎯 Next Actions

1. ✅ Apply database migration
2. ✅ Navigate to `/maintenance/checklists`
3. ✅ Click "New Checklist"
4. ✅ Create your first checklist
5. ✅ Add your first item
6. ✅ Preview the output
7. ✅ Print to PDF

You're now ready to use the Maintenance Checklist Editor!

---

**Happy Checklist Creating!** 🎉
