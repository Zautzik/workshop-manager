# Skill Tree System - API Usage Examples

## Overview

This document provides code examples for interacting with the Skill Tree System API endpoints.

## Authentication

All endpoints require authentication via Supabase auth context.

## Skills Management

### Get All Skills

```typescript
// Fetch all skills with optional filtering
const response = await fetch('/api/skills?category=Offset%20Printing&type=technical');
const skills = await response.json();

// Response example
[
  {
    id: "uuid-1",
    code: "OFFSET_PRESS_BASIC",
    name: "Offset Press - Basic Operation",
    category: "Offset Printing",
    skill_tree_type: "technical",
    parent_skill_id: null,
    is_active: true,
    display_order: 10,
    is_certification_required: false
  }
]
```

### Get Complete Skill Tree (Hierarchical)

```typescript
// Get full hierarchy in tree structure
const response = await fetch('/api/skills/tree');
const { tree, total } = await response.json();

// Response structure
{
  tree: [
    {
      id: "uuid",
      code: "FOUNDATIONAL_SKILL",
      name: "Foundation Skill",
      skill_tree_type: "foundational",
      children: [
        {
          id: "uuid",
          code: "ADVANCED_SKILL",
          name: "Advanced Skill",
          children: []
        }
      ]
    }
  ],
  total: 87
}
```

### Create New Skill

```typescript
const newSkill = {
  code: "DIGITAL_FINISHING",
  name: "Digital Finishing Techniques",
  description: "Operating and maintaining digital finishing equipment",
  category: "Finishing",
  skill_tree_type: "technical",
  parent_skill_id: "uuid-of-parent-or-null",
  is_certification_required: true,
  certification_validity_months: 12
};

const response = await fetch('/api/skills', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(newSkill)
});

const createdSkill = await response.json();
// Returns the created skill object with auto-generated ID
```

### Get Skill Details

```typescript
// Get full skill info including dependencies, children, proficiency levels
const response = await fetch('/api/skills/skill-uuid-here');
const skillDetail = await response.json();

// Response includes
{
  id: "uuid",
  code: "OFFSET_PRESS_ADVANCED",
  name: "Offset Press - Advanced Operation",
  description: "...",
  parent: {
    id: "uuid",
    code: "OFFSET_PRESS_BASIC",
    name: "Offset Press - Basic Operation"
  },
  children: [
    { id: "uuid", code: "CHILD_SKILL", name: "..." }
  ],
  dependencies: [
    {
      id: "uuid",
      required_skill_id: "uuid",
      min_proficiency_required: 2,
      is_hard_requirement: true,
      skills: {
        id: "uuid",
        code: "OFFSET_PRESS_BASIC",
        name: "Offset Press - Basic Operation"
      }
    }
  ],
  proficiencyLevels: [
    {
      id: "uuid",
      level: 1,
      title: "Beginner",
      description: "Beginning to learn this skill",
      min_hours_required: 0,
      can_certify: false
    },
    // ... levels 2-5
  ],
  machineRequirements: [
    {
      id: "uuid",
      machine_id: "uuid",
      min_proficiency: 3,
      is_critical: true,
      machines: {
        id: "uuid",
        name: "Heidelberg Offset Press",
        type: "offset_printer"
      }
    }
  ]
}
```

### Update Skill

```typescript
const skillUpdate = {
  name: "Offset Press - Advanced Operations",
  description: "Updated description",
  parent_skill_id: "new-parent-uuid",
  skill_tree_type: "technical",
  is_certification_required: true,
  certification_validity_months: 12,
  display_order: 15
};

const response = await fetch('/api/skills/skill-uuid-here', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(skillUpdate)
});

const updated = await response.json();
```

### Delete Skill

```typescript
const response = await fetch('/api/skills/skill-uuid-here', {
  method: 'DELETE'
});

// Check status
if (response.ok) {
  const result = await response.json();
  console.log(result); // { success: true, message: "Skill deleted successfully" }
}
```

## Skill Dependencies

### List Dependencies

```typescript
// All dependencies
const response = await fetch('/api/skills/dependencies');
const allDeps = await response.json();

// Dependencies for specific skill
const response = await fetch('/api/skills/dependencies?skill_id=skill-uuid');
const skillDeps = await response.json();

// Response example
[
  {
    id: "uuid",
    skill_id: "offset-advanced-uuid",
    required_skill_id: "offset-basic-uuid",
    min_proficiency_required: 2,
    is_hard_requirement: true,
    description: "Must have basic offset press knowledge first",
    skills: {
      id: "offset-basic-uuid",
      code: "OFFSET_PRESS_BASIC",
      name: "Offset Press - Basic Operation"
    }
  }
]
```

### Create Dependency

```typescript
const dependency = {
  skill_id: "advanced-skill-uuid",
  required_skill_id: "basic-skill-uuid",
  min_proficiency_required: 2,
  is_hard_requirement: true,
  description: "Worker must master basics before advanced training"
};

const response = await fetch('/api/skills/dependencies', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(dependency)
});

const created = await response.json();
```

## Proficiency Levels

### Get Proficiency Levels

```typescript
// All levels for a skill
const response = await fetch('/api/skills/proficiency-levels?skill_id=skill-uuid');
const levels = await response.json();

// Response example
[
  {
    id: "uuid",
    skill_id: "skill-uuid",
    level: 1,
    title: "Beginner",
    description: "Just starting to learn",
    min_hours_required: 0,
    can_certify: false
  },
  {
    id: "uuid",
    skill_id: "skill-uuid",
    level: 3,
    title: "Proficient",
    description: "Can work independently and efficiently",
    min_hours_required: 80,
    can_certify: true
  }
  // ... more levels
]
```

### Create/Update Proficiency Level

```typescript
const level = {
  skill_id: "skill-uuid",
  level: 3,
  title: "Proficient",
  description: "Demonstrates consistent competency, ready for certification",
  min_hours_required: 80,
  can_certify: true
};

const response = await fetch('/api/skills/proficiency-levels', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(level)
});

const upserted = await response.json();
// auto-updates if level/skill combo exists
```

### Delete Proficiency Level

```typescript
const response = await fetch(
  '/api/skills/proficiency-levels?id=level-uuid',
  { method: 'DELETE' }
);

if (response.ok) {
  console.log('Deleted');
}
```

## Worker Qualifications

### Check Worker Skills & Machine Compatibility

```typescript
// Get all skills for a worker
const response1 = await fetch(
  '/api/skills/worker-qualifications?employee_id=emp-uuid'
);
const workerSkills = await response1.json();

// Response
{
  employee_id: "emp-uuid",
  skills: [
    {
      id: "emp-skill-uuid",
      proficiency_level: 3,
      certified: true,
      name: "Offset Press - Basic",
      category: "Offset Printing"
    }
  ],
  qualification_summary: {
    total_skills: 12,
    certified_count: 8
  }
}

// Check specific machine compatibility
const response2 = await fetch(
  '/api/skills/worker-qualifications?employee_id=emp-uuid&machine_id=mach-uuid'
);
const machineQual = await response2.json();

// Response
{
  employee_id: "emp-uuid",
  machine_id: "mach-uuid",
  can_operate: true,
  qualifications: [
    {
      skill_id: "skill-uuid",
      skill_name: "Offset Press - Basic",
      required_proficiency: 2,
      current_proficiency: 3,
      is_critical: true,
      qualified: true
    }
  ],
  missing_skills: [],
  proficiency_score: 100.0
}
```

## Employee Skills

### Get Employee Skills

```typescript
const response = await fetch('/api/employees/employee-uuid/skills');
const skills = await response.json();

// Response
[
  {
    id: "emp-skill-uuid",
    skill_id: "skill-uuid",
    proficiency_level: 3,
    certified: true,
    notes: "Certified by John Smith",
    last_assessed_on: "2026-02-25",
    skills: {
      id: "skill-uuid",
      code: "OFFSET_PRESS_BASIC",
      name: "Offset Press - Basic Operation",
      category: "Offset Printing"
    }
  }
]
```

### Assign Skill to Employee

```typescript
const assignment = {
  employee_id: "emp-uuid",
  skill_id: "skill-uuid",
  proficiency_level: 3,
  certified: true,
  notes: "Passed practical exam on 2026-02-25"
};

const response = await fetch('/api/employees/skills', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(assignment)
});

const assigned = await response.json();
// Auto-sets last_assessed_on to current date
```

### Update Employee Skill

```typescript
const update = {
  proficiency_level: 4,
  certified: true,
  notes: "Advanced training completed"
};

const response = await fetch('/api/employees/skills/emp-skill-uuid', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(update)
});

const updated = await response.json();
// Auto-updates assessment date
```

### Remove Skill from Employee

```typescript
const response = await fetch('/api/employees/skills/emp-skill-uuid', {
  method: 'DELETE'
});

const result = await response.json();
// { success: true }
```

## React Hook Example

```typescript
import { useQuery } from '@tanstack/react-query';

function SkillTreeView() {
  const { data: skillTree, isLoading, error } = useQuery({
    queryKey: ['skills', 'tree'],
    queryFn: async () => {
      const res = await fetch('/api/skills/tree');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <p>Total Skills: {skillTree.total}</p>
      {/* Render tree */}
    </div>
  );
}
```

## Error Handling

All endpoints return JSON with status codes:

```typescript
try {
  const response = await fetch('/api/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skillData)
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Error:', error.error); // Descriptive message
    // Status codes:
    // 400 - Bad request (missing fields)
    // 401 - Unauthorized (not authenticated)
    // 404 - Not found
    // 500 - Server error
  }

  const data = await response.json();
  return data;
} catch (error) {
  console.error('Network error:', error);
}
```

## Performance Tips

1. **Cache queries** - Use React Query with appropriate staleTime
2. **Batch operations** - Combine requests where possible
3. **Limit results** - Use filters for large datasets
4. **Lazy load** - Load details only when needed

Example with React Query:

```typescript
const queryClient = useQueryClient();

// Prefetch related data
useEffect(() => {
  queryClient.prefetchQuery({
    queryKey: ['skills', 'tree'],
    queryFn: () => fetch('/api/skills/tree').then(r => r.json()),
  });
}, [queryClient]);
```

## Batch Operations

For bulk skill assignments:

```typescript
// Assign multiple skills to one employee
const skills = [
  { skill_id: 'uuid1', proficiency_level: 2, certified: false },
  { skill_id: 'uuid2', proficiency_level: 3, certified: true },
  { skill_id: 'uuid3', proficiency_level: 2, certified: false }
];

const results = await Promise.all(
  skills.map(skill =>
    fetch('/api/employees/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: empId,
        ...skill
      })
    }).then(r => r.json())
  )
);
```

This API is designed to be simple, flexible, and performant. Use these examples as starting points for your implementation!
