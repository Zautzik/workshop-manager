/**
 * @fileoverview Maintenance Checklist Editor - Example Use Cases & Templates
 * 
 * This file provides real-world examples and pre-built checklist templates
 * that you can copy and use immediately in your maintenance operations.
 */

// ============================================
// EXAMPLE 1: Offset Printer - Daily Startup
// ============================================

export const offsetPrinterDailyStartup = {
  name: 'Offset Printer - Daily Startup Check',
  machineType: 'Offset Printer',
  maintenanceType: 'inspection' as const,
  items: [
    {
      id: '1',
      step: 1,
      title: 'Visual inspection of ink rollers',
      description: `
Check for any visible damage, ink buildup, or debris.
Look for uneven wear patterns.
Note any cracks or soft spots.
      `,
      estimatedTime: 5,
      priority: 'high' as const,
      toolsRequired: ['Flashlight', 'Visual inspection'],
    },
    {
      id: '2',
      step: 2,
      title: 'Check water fountain level',
      description: `
Verify water/chemical solution level is at proper mark.
Check pH is within acceptable range (typically 4.5-5.5).
Top up if needed with prepared solution.
      `,
      estimatedTime: 5,
      priority: 'medium' as const,
      toolsRequired: ['pH meter'],
    },
    {
      id: '3',
      step: 3,
      title: 'Test ink feed system',
      description: `
Run test print at normal speed.
Verify ink distribution is even.
Check for any dropouts or light areas.
      `,
      estimatedTime: 10,
      priority: 'high' as const,
      toolsRequired: ['Test stock'],
    },
  ],
  totalEstimatedTime: 20,
};

// ============================================
// EXAMPLE 2: Guillotine - Weekly Maintenance
// ============================================

export const guillotineWeeklyMaintenance = {
  name: 'Guillotine - Weekly Maintenance & Safety Check',
  machineType: 'Guillotine',
  maintenanceType: 'preventive' as const,
  items: [
    {
      id: '1',
      step: 1,
      title: 'Safety mechanism verification',
      description: `
Test blade guard engagement multiple times.
Verify emergency stop is functional.
Check foot pedal operation and responsiveness.
Ensure back gauge sensor is working.
      `,
      estimatedTime: 15,
      priority: 'critical' as const,
      toolsRequired: ['Screwdriver set', 'Testing procedures'],
    },
    {
      id: '2',
      step: 2,
      title: 'Blade inspection and cleaning',
      description: `
Visually inspect blade for chips, cracks, or dull spots.
Clean blade edge with fine stone if needed.
Wipe blade clean and check sharpness.
NOTE: Do NOT touch blade with bare hands - use brush.
      `,
      estimatedTime: 20,
      priority: 'high' as const,
      toolsRequired: ['Safety gloves', 'Soft brush', 'Fine stone', 'Oil cloth'],
    },
    {
      id: '3',
      step: 3,
      title: 'Clean base plate and guide rails',
      description: `
Remove all paper scraps and debris.
Wipe down with clean cloth.
Check for any buildup or paper jam evidence.
      `,
      estimatedTime: 10,
      priority: 'medium' as const,
      toolsRequired: ['Brush', 'Clean cloth'],
    },
    {
      id: '4',
      step: 4,
      title: 'Lubricate moving parts',
      description: `
Apply light machine oil to:
- Guide rail joints
- Blade pivot points
- Gauge adjustment mechanisms
Use sparingly to avoid mess.
      `,
      estimatedTime: 10,
      priority: 'medium' as const,
      toolsRequired: ['Light machine oil', 'Oil can or brush'],
    },
    {
      id: '5',
      step: 5,
      title: 'Test cut quality',
      description: `
Prepare test cutting of standard paper (20lb white).
Make 5 consecutive cuts at different gauge positions.
Verify all cuts are clean with no jagged edges.
Document any issues.
      `,
      estimatedTime: 10,
      priority: 'high' as const,
      toolsRequired: ['Test stock (20lb white)', 'Ruler', 'Log sheet'],
    },
  ],
  totalEstimatedTime: 65,
};

// ============================================
// EXAMPLE 3: Digital Printer - Monthly Cleaning
// ============================================

export const digitalPrinterMonthlyCleaning = {
  name: 'Digital Printer - Monthly Deep Clean & Calibration',
  machineType: 'Digital Printer',
  maintenanceType: 'preventive' as const,
  items: [
    {
      id: '1',
      step: 1,
      title: 'Power down and cool system',
      description: `
Turn off main power switch.
Wait 30 minutes for system to cool.
Ensure all moving parts have stopped.
      `,
      estimatedTime: 35,
      priority: 'high' as const,
      toolsRequired: ['None'],
    },
    {
      id: '2',
      step: 2,
      title: 'Clean toner cartridge area',
      description: `
Open cartridge access panel.
Remove any spilled toner with vacuum (toner-safe filter).
Wipe contacts with dry cloth.
Reinstall cartridges ensuring proper seating.
      `,
      estimatedTime: 15,
      priority: 'high' as const,
      toolsRequired: ['HEPA vacuum', 'Lint-free cloth', 'Antistatic wrist strap'],
    },
    {
      id: '3',
      step: 3,
      title: 'Clean fuser and feed rollers',
      description: `
Use approved cleaning sheets per manufacturer specs.
Run through entire sheet pack.
Inspect for any remaining debris.
      `,
      estimatedTime: 20,
      priority: 'high' as const,
      toolsRequired: ['Fuser cleaning sheets', 'Safety gloves'],
    },
    {
      id: '4',
      step: 4,
      title: 'Color calibration check',
      description: `
Power system back on.
Run color calibration pattern from maintenance menu.
Print test color profile.
Compare to reference card.
Document any color drift noted.
      `,
      estimatedTime: 15,
      priority: 'high' as const,
      toolsRequired: ['Color reference card', 'Test stock'],
    },
    {
      id: '5',
      step: 5,
      title: 'Test print quality',
      description: `
Print full-page test pattern.
Check for any streaks, lines, or spots.
Verify color consistency across page.
Run 10 pages of gradient test.
      `,
      estimatedTime: 10,
      priority: 'medium' as const,
      toolsRequired: ['Test stock', 'Magnifying glass'],
    },
  ],
  totalEstimatedTime: 95,
};

// ============================================
// EXAMPLE 4: Die Cutter - Quarterly Maintenance
// ============================================

export const dieCutterQuarterlyMaintenance = {
  name: 'Die Cutter - Quarterly Preventive Maintenance',
  machineType: 'Die Cutter',
  maintenanceType: 'preventive' as const,
  items: [
    {
      id: '1',
      step: 1,
      title: 'Hydraulic system pressure check',
      description: `
Locate pressure gauge on machine.
Record current pressure reading.
Compare to machine specifications (typically 1200-1500 PSI).
If low, notify maintenance supervisor.
Verify hoses have no visible leaks.
      `,
      estimatedTime: 10,
      priority: 'critical' as const,
      toolsRequired: ['Pressure gauge', 'Specifications sheet'],
    },
    {
      id: '2',
      step: 2,
      title: 'Die block and cutting bed inspection',
      description: `
Remove current die from machine.
Inspect cutting bed for:
- Worn areas
- Embedded material or debris
- Cracks or damage
Clean thoroughly with appropriate cleaner.
      `,
      estimatedTime: 20,
      priority: 'high' as const,
      toolsRequired: ['Brush', 'Cleaning solution', 'Scraper', 'Clean cloth'],
    },
    {
      id: '3',
      step: 3,
      title: 'Die block condition assessment',
      description: `
Inspect die block edges for wear or damage.
Check cutting edge sharpness.
Look for any rust or corrosion on metal surfaces.
If die is damaged, mark for replacement.
Apply light oil coat if storing long-term.
      `,
      estimatedTime: 15,
      priority: 'high' as const,
      toolsRequired: ['Loupe or magnifier', 'Oil cloth', 'Light machine oil'],
    },
    {
      id: '4',
      step: 4,
      title: 'Guide rail lubrication',
      description: `
Apply light machine oil to all guide rails.
Cycle machine 5 times through full range.
Wipe away excess oil.
Check for smooth operation without binding.
      `,
      estimatedTime: 15,
      priority: 'medium' as const,
      toolsRequired: ['Light machine oil', 'Oil can', 'Clean cloth'],
    },
    {
      id: '5',
      step: 5,
      title: 'Belt tension and pulley inspection',
      description: `
Check belt tension per specifications.
Spin pulleys by hand - should rotate freely.
Inspect belt for cracks, fraying, or glazing.
Check pulley alignment with straightedge.
Adjust if necessary, or mark for replacement.
      `,
      estimatedTime: 15,
      priority: 'high' as const,
      toolsRequired: ['Tension gauge', 'Straightedge', 'Wrench set'],
    },
    {
      id: '6',
      step: 6,
      title: 'Reinstall die and test operation',
      description: `
Reinstall die block securely.
Verify proper seating and clamping.
Run 10 test cuts without material.
Run 10 test cuts on scrap material.
Check consistency and quality.
Document any issues in log.
      `,
      estimatedTime: 15,
      priority: 'high' as const,
      toolsRequired: ['Test material', 'Maintenance log'],
    },
  ],
  totalEstimatedTime: 90,
};

// ============================================
// EXAMPLE 5: Binding Machine - Emergency Repair
// ============================================

export const bindingMachineEmergencyRepair = {
  name: 'Binding Machine - Emergency Shutdown & Inspection',
  machineType: 'Binding Machine',
  maintenanceType: 'emergency' as const,
  items: [
    {
      id: '1',
      step: 1,
      title: 'Immediate power shutdown',
      description: `
Press EMERGENCY STOP button immediately.
Switch main power to OFF.
Ensure all moving parts have come to complete stop.
Wait 10 seconds before proceeding.
      `,
      estimatedTime: 2,
      priority: 'critical' as const,
      toolsRequired: ['None'],
    },
    {
      id: '2',
      step: 2,
      title: 'Identify source of problem',
      description: `
Listen for any unusual sounds continuing.
Smell for burnt odors or smoke.
Visually inspect for obvious damage.
Check for any jammed material.
NOTE: Do NOT attempt to remove items from moving mechanisms.
      `,
      estimatedTime: 5,
      priority: 'critical' as const,
      toolsRequired: ['Flashlight', 'Safety glasses'],
    },
    {
      id: '3',
      step: 3,
      title: 'Remove jammed material safely',
      description: `
Use wooden or plastic tools - NO METAL.
Never reach into binding mechanisms.
Gently work jammed paper free.
Take photos of jam location before removal (for analysis).
      `,
      estimatedTime: 15,
      priority: 'high' as const,
      toolsRequired: ['Wooden stick or dowel', 'Plastic scraper', 'Camera/phone'],
    },
    {
      id: '4',
      step: 4,
      title: 'Inspect for damage',
      description: `
Check for:
- Bent or broken punches
- Cracked housing or frame
- Burnt wiring or components
- Leaking hydraulic fluid
- Loose or missing fasteners
Document all damage photographically.
      `,
      estimatedTime: 10,
      priority: 'high' as const,
      toolsRequired: ['Flashlight', 'Camera', 'Damage report form'],
    },
    {
      id: '5',
      step: 5,
      title: 'Prepare incident report',
      description: `
Record:
- Time of incident
- What operator was doing when it occurred
- Description of sounds, smells, or visual indicators
- Photos of damage
- List of materials jammed or damaged
- Initial assessment of severity
      `,
      estimatedTime: 10,
      priority: 'high' as const,
      toolsRequired: ['Incident report form', 'Camera'],
    },
    {
      id: '6',
      step: 6,
      title: 'Notify supervisor and tag equipment',
      description: `
Call supervisor/maintenance manager immediately.
Affix "OUT OF SERVICE" tag to machine.
Do NOT attempt to restart machine.
Provide incident report and photos.
Wait for specialist evaluation.
      `,
      estimatedTime: 5,
      priority: 'critical' as const,
      toolsRequired: ['Out of Service tags', 'Phone'],
    },
  ],
  totalEstimatedTime: 47,
};

// ============================================
// EXAMPLE 6: Complete Equipment Inspection
// ============================================

export const completeEquipmentInspection = {
  name: 'Annual Complete Equipment Safety Inspection',
  machineType: 'All Equipment',
  maintenanceType: 'inspection' as const,
  items: [
    {
      id: '1',
      step: 1,
      title: 'Electrical safety inspection',
      description: `
Check power cords for:
- Visible damage or wear
- Proper insulation
- Ground prong condition
Test ground continuity with multimeter.
Verify proper voltage at outlet.
Check for any burnt smells near connections.
      `,
      estimatedTime: 20,
      priority: 'critical' as const,
      toolsRequired: ['Multimeter', 'Voltage tester', 'Ground tester'],
    },
    {
      id: '2',
      step: 2,
      title: 'Safety guard and interlock check',
      description: `
Verify all guards are in place and secure.
Test all interlocks (they should prevent operation when open).
Check for damaged, missing, or loose guards.
Verify warning labels are present and legible.
      `,
      estimatedTime: 15,
      priority: 'critical' as const,
      toolsRequired: ['Screwdriver set', 'Visual inspection'],
    },
    {
      id: '3',
      step: 3,
      title: 'Emergency stop button test',
      description: `
Locate all emergency stop buttons.
Press each one - machine should stop immediately.
Verify button pops back out after pressing.
Check button label is clear and visible.
      `,
      estimatedTime: 10,
      priority: 'critical' as const,
      toolsRequired: ['None'],
    },
    {
      id: '4',
      step: 4,
      title: 'Moving parts guarding',
      description: `
Verify all rotating parts are guarded.
Check guards cannot be accessed during operation.
Look for pinch points and sharp edges.
Verify warning labels near hazardous areas.
      `,
      estimatedTime: 15,
      priority: 'critical' as const,
      toolsRequired: ['Inspection checklist'],
    },
    {
      id: '5',
      step: 5,
      title: 'Hydraulic/pneumatic system check',
      description: `
Inspect all hoses for cracks, leaks, or loose connections.
Check pressure gauges for proper readings.
Look for fluid leaks on floor beneath equipment.
Verify relief valves are properly set.
      `,
      estimatedTime: 15,
      priority: 'high' as const,
      toolsRequired: ['Pressure gauge', 'Leak detection fluid', 'Cloth'],
    },
    {
      id: '6',
      step: 6,
      title: 'Structural integrity assessment',
      description: `
Check frame for cracks or bending.
Verify all fasteners are tight.
Look for rust, corrosion, or deterioration.
Check machine is level and stable.
Verify leveling feet are intact.
      `,
      estimatedTime: 15,
      priority: 'high' as const,
      toolsRequired: ['Wrench set', 'Level', 'Visual inspection'],
    },
    {
      id: '7',
      step: 7,
      title: 'Complete test run',
      description: `
Verify operator can start machine properly.
Test all operational modes.
Check for unusual sounds, vibrations, or smells.
Test full speed and load operation.
Verify all indicators and displays work.
      `,
      estimatedTime: 20,
      priority: 'high' as const,
      toolsRequired: ['Test material', 'Observation checklist'],
    },
    {
      id: '8',
      step: 8,
      title: 'Document findings and certification',
      description: `
Summarize all findings on inspection form.
Note any defects or concerns found.
Recommend any repairs or follow-up inspections.
Sign and date the inspection certificate.
Maintain record for regulatory compliance.
      `,
      estimatedTime: 15,
      priority: 'high' as const,
      toolsRequired: ['Inspection form', 'Pen'],
    },
  ],
  totalEstimatedTime: 125,
};

// ============================================
// QUICK COPY-PASTE TEMPLATES
// ============================================

export const allTemplates = [
  offsetPrinterDailyStartup,
  guillotineWeeklyMaintenance,
  digitalPrinterMonthlyCleaning,
  dieCutterQuarterlyMaintenance,
  bindingMachineEmergencyRepair,
  completeEquipmentInspection,
];

/*

HOW TO USE THESE TEMPLATES:

1. Open Maintenance Checklist Editor
2. Click "New Checklist"
3. Fill in name and machine type
4. Select maintenance type
5. Click Create
6. Manually add items using these templates as reference
   OR
7. Copy the JSON structure above and adapt as needed

CUSTOMIZATION TIPS:

- Adjust time estimates based on YOUR equipment
- Add specific tool names from your shop
- Include local procedures or standards
- Add contact numbers for specialist repairs
- Reference your equipment manuals
- Include SKUs for replacement parts
- Add cost estimates for parts and labor

BEST PRACTICES:

✓ Create separate checklists for each major equipment type
✓ Have different checklists for different maintenance intervals
✓ Include photos or diagrams in notes where helpful
✓ Review and update checklists quarterly
✓ Gather technician feedback for improvements
✓ Track actual vs. estimated times for better planning
✓ Keep historical records of all maintenance performed

*/

export {};
