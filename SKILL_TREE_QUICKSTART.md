# Skill Tree System - Quick Start Guide

## 🚀 Getting Started

### Step 1: Apply Database Migrations

The skill tree system requires two database migrations. Run these in your Supabase environment:

```bash
# Navigate to your migrations directory
cd supabase/migrations/

# The following files contain the required migrations:
# - 20260225120000_skill_tech_tree.sql     (Main structure)
# - 20260225120100_seed_skill_tree.sql     (Initial data)
```

**Via Supabase Dashboard:**
1. Go to SQL Editor
2. Copy contents of `20260225120000_skill_tech_tree.sql`
3. Run the query
4. Copy contents of `20260225120100_seed_skill_tree.sql`
5. Run the query

**Via CLI:**
```bash
supabase db push
```

### Step 2: Verify Installation

After migrations run, you should see:
- ✅ 80+ skills in the system
- ✅ Skill tree hierarchy established
- ✅ Machine requirements linked
- ✅ Proficiency levels defined

### Step 3: Access the New Features

1. **Log in as HR Manager**
   - Navigate to: Dashboard → HR Manager

2. **Go to Skills Tab**
   - You'll see two options:
     - **Skill Tech Tree** - Manage and customize skills
     - **Worker Proficiency** - Assign skills and view qualifications

## 📋 Pre-Seeded Skill Categories

The system comes with these skill categories:

### Foundational Skills
- Safety Awareness
- Machinery Basics
- Measurement & Reading
- Basic Hand Tools
- Quality Control Basics

### Manufacturing Skills
- **Offset Printing**: Basic, Advanced, Pre-Press Setup
- **Cutting & Binding**: Guillotine (Basic/Advanced), Die Cutting, Assembly
- **Finishing**: Lamination, Embossing, Quality Control

### Operational Skills
- Workflow Planning
- Material Handling
- Production Scheduling
- Equipment Maintenance
- Manual Workshop Skills

### Supervisory Skills
- Team Leadership
- Shift Management
- Quality Assurance Management
- Cost & Waste Control

### Specialized Skills
- Digital File Preparation
- Color Management
- Large Format Printing
- Variable Data Printing
- Design Consultation

## 🎯 Common Tasks

### Assign a Skill to a Worker

1. **Go to:** HR Manager → Skills → Worker Proficiency
2. **Search** for the employee
3. **Click** "Add Skill"
4. **Select:** 
   - Which skill to assign
   - Proficiency level (1-5)
   - Whether it's certified
5. **Save**

System automatically tracks:
- When the skill was assessed
- Current proficiency level
- Certification status
- Hours of practice

### Create a New Skill in Your Tech Tree

1. **Go to:** HR Manager → Skills → Skill Tech Tree
2. **Click** "New Skill"
3. **Fill out:**
   - Code (required, auto-uppercase)
   - Name (required)
   - Description
   - Category  
   - Skill Type (Foundational/Technical/Operational/Supervisory/Specialized)
   - Parent Skill (optional - for hierarchy)
   - Certification details (optional)
4. **Save**

### Link a Skill to a Machine

Currently done through database or API. In the Workers → Assign Machine flow:
- System automatically validates if worker has required skills
- Shows missing skills if any
- Prevents assignment if critical skills are missing

### View Worker Qualifications

1. **Go to:** HR Manager → Skills → Worker Proficiency
2. **Select** an employee
3. **Go to** "Machines" tab to see:
   - ✅ Green checkmark = Can operate safely
   - 🔒 Red lock = Missing required skills
4. Click machine name and see details

### Analyze Skill Gaps

1. **Select** a worker
2. **Go to** "Analysis" tab
3. View:
   - **Proficiency Distribution** - Bar chart vs industry standard
   - **Skills Radar** - Visual profile of strengths
   - **Level Summary** - How many skills at each level

## 🔧 Customization Tips

### Modify Proficiency Levels

Each skill's proficiency levels are customizable. For example:

**Default:** 1=Beginner → 5=Expert

**Custom for your workshop:**
- Level 1: Just watched training
- Level 2: Can work with supervision  
- Level 3: Independent operator
- Level 4: Trains others
- Level 5: Process optimization

To modify via API: `POST /api/skills/proficiency-levels`

### Create Skill Dependencies

Some skills require others as prerequisites. Set this up to:
- Prevent workers from being assigned advanced roles
- Track training prerequisites
- Generate training paths

**Example:** "Advanced Offset Press" requires "Basic Offset Press" at level 2

### Color Code By Proficiency

Proficiency levels automatically color-coded:
- 🔴 Level 1: Red (Beginner)
- 🟠 Level 2: Orange (Intermediate)
- 🟡 Level 3: Yellow (Proficient)
- 🟢 Level 4: Light Green (Advanced)
- 🟢 Level 5: Dark Green (Expert)

## 📊 Data Views

### Skills Tab Contents

**Tree View:** Hierarchical display
- Expandable parent-child relationships
- Search by name/code
- Filter by type or category
- See which skills depend on others

**List View:** Categories breakdown
- Skills grouped by type
- Count per category
- Quick selection interface

**Details:** Full skill information
- Proficiencies for each level
- Dependencies (prerequisites)
- Child skills
- Machines that need this skill
- Edit/Delete options

### Worker Proficiency Contents

**Skills Tab:**
- All assigned skills
- Current proficiency level (1-5)
- Visual progress bar
- Edit/Update options

**Machines Tab:**
- Which machines worker can operate
- Missing skills highlighted
- Filter by specific machine
- Qualification status

**Analysis Tab:**
- Proficiency distribution chart
- Radar chart visualization
- Summary statistics
- Gaps vs. standards

## ⚙️ API Reference

All endpoints return JSON. Key ones:

```typescript
// List all skills
GET /api/skills

// Get skill details with dependencies
GET /api/skills/:id

// Get full hierarchy
GET /api/skills/tree

// Check if worker can operate machine
GET /api/skills/worker-qualifications?employee_id=X&machine_id=Y

// Assign skill to worker
POST /api/employees/skills
Body: {
  employee_id: string,
  skill_id: string,
  proficiency_level: 1-5,
  certified: boolean,
  notes?: string
}
```

## 🆘 Troubleshooting

### "Skills not showing"
1. Check migrations were applied successfully
2. Verify database has records: `SELECT COUNT(*) FROM skills;`
3. Clear browser cache
4. Restart dev server

### "Can't add skills to worker"
1. Check worker exists in employees table
2. Verify skill is in skills table
3. Check Supabase auth context is working

### "Worker can't be assigned to machine"
1. Check machine_skill_requirements table
2. Verify worker has all critical skills
3. Check proficiency levels meet minimum

### "Skill tree loads slowly"
- Normal first load can be 500ms-1s
- Subsequent loads cached and faster
- Consider limiting displayed skills if 500+ in tree

## 📚 Next Steps

1. **Review pre-seeded tree** - Start with the provided skills
2. **Customize categories** - Add/modify to match your operations
3. **Assign existing staff** - Build current capability baseline
4. **Identify gaps** - See where training is needed
5. **Plan training** - Use dependencies to create paths
6. **Track progress** - Update proficiency as workers develop

## 💡 Pro Tips

- **Start broad:** Use general skills first, specialize later
- **Use dependencies:** Train advanced skills after basics
- **Track hours:** Log practice hours in `hours_practiced` field
- **Certify regularly:** Set certification requirements for safety-critical roles
- **Review quarterly:** Update proficiency levels as skills improve

## 📞 Support

For technical issues:
1. Check console for error messages
2. Review SQL migration files for schema details
3. Check API endpoint files for usage examples
4. Review component JSDoc comments for UI props

Good luck with your skill tree system! 🎯
