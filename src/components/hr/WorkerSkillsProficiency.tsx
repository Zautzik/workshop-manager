/**
 * @fileoverview Worker Skills Proficiency Component
 * Displays worker skills with proficiency levels and machine qualifications
 */
'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useEmployees } from '@/hooks/use-employees';
import {
  Award,
  Zap,
  TrendingUp,
  AlertTriangle,
  Check,
  Lock,
  Plus,
  Edit2,
} from 'lucide-react';

const PROFICIENCY_LEVELS = [
  { value: 1, label: 'Beginner', color: '#ef4444', icon: '🔴' },
  { value: 2, label: 'Intermediate', color: '#f97316', icon: '🟠' },
  { value: 3, label: 'Proficient', color: '#eab308', icon: '🟡' },
  { value: 4, label: 'Advanced', color: '#84cc16', icon: '🟢' },
  { value: 5, label: 'Expert', color: '#22c55e', icon: '🟢' },
];

const WorkerSkillsProficiency = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading: employeesLoading } = useEmployees();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [machineFilterId, setMachineFilterId] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);

  const [skillForm, setSkillForm] = useState({
    skill_id: '',
    proficiency_level: 3,
    certified: false,
    notes: '',
  });

  // Fetch worker qualifications if employee selected
  const { data: workerQualifications = null, isLoading: qualificationsLoading } = useQuery({
    queryKey: ['skills', 'worker-qualifications', selectedEmployeeId],
    queryFn: async () => {
      if (!selectedEmployeeId) return null;
      const res = await fetch(`/api/skills/worker-qualifications?employee_id=${selectedEmployeeId}`);
      if (!res.ok) throw new Error('Failed to fetch qualifications');
      return res.json();
    },
    enabled: !!selectedEmployeeId,
  });

  // Fetch all skills
  const { data: allSkills = [] } = useQuery({
    queryKey: ['skills', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error('Failed to fetch skills');
      return res.json();
    },
  });

  // Fetch machines
  const { data: machines = [] } = useQuery({
    queryKey: ['machines'],
    queryFn: async () => {
      const res = await fetch('/api/machines');
      if (!res.ok) throw new Error('Failed to fetch machines');
      return res.json();
    },
  });

  const selectedEmployee = employees.find((e: any) => e.id === selectedEmployeeId);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!workerQualifications?.skills) return [];
    return workerQualifications.skills.map((skill: any) => ({
      name: skill.name,
      level: skill.proficiency_level || 0,
      required: 3,
    }));
  }, [workerQualifications]);

  // Get machine qualifications
  const machineQualifications = useMemo(() => {
    if (!selectedEmployeeId || !machines.length) return [];

    return machines
      .map((machine: any) => ({
        ...machine,
        qualified: workerQualifications?.qualifications?.some(
          (q: any) => q.qualified && q.is_critical
        ) || false,
      }))
      .filter((m: any) => !machineFilterId || m.id === machineFilterId);
  }, [selectedEmployeeId, machines, machineFilterId, workerQualifications]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((e: any) =>
      e.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.employee_code?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [employees, searchTerm]);

  const handleAddSkill = async () => {
    if (!selectedEmployeeId || !skillForm.skill_id) {
      toast({
        title: 'Error',
        description: 'Please select an employee and skill',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/employees/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: selectedEmployeeId,
          ...skillForm,
        }),
      });

      if (!response.ok) throw new Error('Failed to add skill');

      toast({
        title: 'Success',
        description: 'Skill added successfully',
      });

      queryClient.invalidateQueries({
        queryKey: ['skills', 'worker-qualifications', selectedEmployeeId],
      });
      setSkillDialogOpen(false);
      setSkillForm({
        skill_id: '',
        proficiency_level: 3,
        certified: false,
        notes: '',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getProficiencyColor = (level: number) => {
    const prof = PROFICIENCY_LEVELS.find((p) => p.value === level);
    return prof?.color || '#999';
  };

  const getProficiencyLabel = (level: number) => {
    const prof = PROFICIENCY_LEVELS.find((p) => p.value === level);
    return prof?.label || 'Unknown';
  };

  if (employeesLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Worker Skills Proficiency</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading employees...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5" />
              Worker Skills & Proficiency
            </CardTitle>
            <CardDescription>
              Track worker proficiency levels and machine qualifications
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Employee Selection */}
          <div className="lg:col-span-3 space-y-4">
            <div>
              <Label>Search & Select Employee</Label>
              <Input
                placeholder="Search by name or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
              {filteredEmployees.map((employee: any) => (
                <button
                  key={employee.id}
                  onClick={() => setSelectedEmployeeId(employee.id)}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    selectedEmployeeId === employee.id
                      ? 'border-primary bg-primary/10'
                      : 'border-transparent bg-muted/50 hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium text-sm">{employee.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {employee.employee_code || 'No code'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {employee.department}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Summary Stats */}
          {selectedEmployee && (
            <div className="space-y-2">
              <Card className="border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Skills Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Total Skills
                    </p>
                    <p className="text-2xl font-bold">
                      {workerQualifications?.skills?.length || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Proficiency Score
                    </p>
                    <p className="text-2xl font-bold">
                      {Math.round(
                        workerQualifications?.proficiency_score || 0
                      )}%
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSkillDialogOpen(true)}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Skill
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {selectedEmployee && qualificationsLoading && (
          <p className="text-muted-foreground">Loading qualifications...</p>
        )}

        {selectedEmployee && workerQualifications && (
          <Tabs defaultValue="skills" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="machines">Machines</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
            </TabsList>

            {/* Skills Tab */}
            <TabsContent value="skills" className="space-y-4">
              <div className="space-y-2">
                {workerQualifications.skills && workerQualifications.skills.length > 0 ? (
                  workerQualifications.skills.map((skill: any) => {
                    const profLevel = PROFICIENCY_LEVELS.find(
                      (p) => p.value === skill.proficiency_level
                    );
                    return (
                      <div
                        key={skill.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-primary/10 bg-muted/40"
                      >
                        <div>
                          <div className="font-medium text-sm">{skill.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {skill.category}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div
                              className="text-sm font-semibold"
                              style={{
                                color: getProficiencyColor(
                                  skill.proficiency_level
                                ),
                              }}
                            >
                              {skill.proficiency_level}/5
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {getProficiencyLabel(skill.proficiency_level)}
                            </div>
                          </div>
                          <div className="w-32 bg-muted rounded-full h-2">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${(skill.proficiency_level / 5) * 100}%`,
                                backgroundColor: getProficiencyColor(
                                  skill.proficiency_level
                                ),
                              }}
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No skills assigned to this worker yet</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSkillDialogOpen(true)}
                      className="mt-4"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Skill
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Machines Tab */}
            <TabsContent value="machines" className="space-y-4">
              <Select
                value={machineFilterId ?? 'all'}
                onValueChange={(v) =>
                  setMachineFilterId(v === 'all' ? undefined : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter machines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Machines</SelectItem>
                  {machines.map((machine: any) => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {machine.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="space-y-2">
                {machineQualifications.length > 0 ? (
                  machineQualifications.map((machine: any) => {
                    const qualified = machine.qualified;
                    return (
                      <div
                        key={machine.id}
                        className={`p-3 rounded-lg border transition-all ${
                          qualified
                            ? 'border-green-200 bg-green-50/50 dark:bg-green-950/20'
                            : 'border-red-200 bg-red-50/50 dark:bg-red-950/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm">
                              {machine.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {machine.type}
                            </div>
                          </div>
                          {qualified ? (
                            <Check className="w-5 h-5 text-green-600" />
                          ) : (
                            <Lock className="w-5 h-5 text-red-600" />
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center py-4 text-muted-foreground">
                    No machines available
                  </p>
                )}
              </div>
            </TabsContent>

            {/* Analysis Tab */}
            <TabsContent value="analysis" className="space-y-4">
              {chartData.length > 0 && (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">
                        Proficiency Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                          <YAxis domain={[0, 5]} />
                          <Tooltip />
                          <Legend />
                          <Bar
                            dataKey="level"
                            fill="#eab308"
                            name="Current Level"
                          />
                          <Bar
                            dataKey="required"
                            fill="#9ca3af"
                            name="Target Level"
                            opacity={0.5}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">
                        Skills Radar
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <RadarChart data={chartData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="name" />
                          <PolarRadiusAxis domain={[0, 5]} />
                          <Radar
                            name="Proficiency"
                            dataKey="level"
                            stroke="#eab308"
                            fill="#eab308"
                            fillOpacity={0.6}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Proficiency Levels
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {PROFICIENCY_LEVELS.map((level) => {
                        const count = chartData.filter(
                          (d: any) => d.level === level.value
                        ).length;
                        return (
                          <div key={level.value} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span>{level.icon}</span>
                              <span>{level.label}</span>
                            </div>
                            <span className="font-semibold">{count}</span>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}

        {!selectedEmployee && (
          <div className="text-center py-12 text-muted-foreground">
            <Award className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Select an employee to view their skill profile</p>
          </div>
        )}
      </CardContent>

      {/* Add Skill Dialog */}
      <Dialog open={skillDialogOpen} onOpenChange={setSkillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Skill</DialogTitle>
            <DialogDescription>
              Assign a skill to {selectedEmployee?.full_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Skill *</Label>
              <Select
                value={skillForm.skill_id}
                onValueChange={(value) =>
                  setSkillForm({ ...skillForm, skill_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a skill" />
                </SelectTrigger>
                <SelectContent>
                  {allSkills.map((skill: any) => (
                    <SelectItem key={skill.id} value={skill.id}>
                      {skill.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Proficiency Level *</Label>
              <Select
                value={skillForm.proficiency_level.toString()}
                onValueChange={(value) =>
                  setSkillForm({
                    ...skillForm,
                    proficiency_level: parseInt(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFICIENCY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value.toString()}>
                      {level.value} - {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSkillDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAddSkill}>Add Skill</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default WorkerSkillsProficiency;
