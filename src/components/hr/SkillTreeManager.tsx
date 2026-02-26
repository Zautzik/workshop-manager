/**
 * @fileoverview Skills Tree Manager Component
 * Allows HR Managers to view, create, edit, and manage the skill/tech tree
 * Features: Hierarchical view, dependency management, proficiency levels
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Plus,
  Trash2,
  AlertCircle,
  Check,
  X,
  TreePine,
  Zap,
  Award,
  Briefcase,
  Users,
  GraduationCap,
} from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const SKILL_TREE_TYPES = [
  { value: 'foundational', label: 'Foundational', icon: GraduationCap },
  { value: 'technical', label: 'Technical', icon: Zap },
  { value: 'operational', label: 'Operational', icon: Briefcase },
  { value: 'supervisory', label: 'Supervisory', icon: Users },
  { value: 'specialized', label: 'Specialized', icon: Award },
];

const getTypeIcon = (type: string) => {
  const typeConfig = SKILL_TREE_TYPES.find((t) => t.value === type);
  const IconComponent = typeConfig?.icon || TreePine;
  return <IconComponent className="w-4 h-4" />;
};

const SkillTreeManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(
    new Set(['root'])
  );
  const [selectedSkill, setSelectedSkill] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState('tree');

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    category: '',
    skill_tree_type: 'technical',
    parent_skill_id: null as string | null,
    is_certification_required: false,
    certification_validity_months: 12,
    icon_name: '',
  });

  // Fetch skill tree
  const { data: skillTree = { tree: [], total: 0 }, isLoading } = useQuery({
    queryKey: ['skills', 'tree'],
    queryFn: async () => {
      const res = await fetch('/api/skills/tree');
      if (!res.ok) throw new Error('Failed to fetch skills');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all skills for parent selection
  const { data: allSkills = [] } = useQuery({
    queryKey: ['skills', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error('Failed to fetch skills');
      return res.json();
    },
  });

  // Search and filter skills
  const filteredSkills = useMemo(() => {
    const flattenTree = (items: any[]): any[] => {
      return items.flatMap((item) => [
        item,
        ...(item.children ? flattenTree(item.children) : []),
      ]);
    };

    let flat = flattenTree(skillTree.tree);

    if (searchTerm) {
      flat = flat.filter(
        (skill) =>
          skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          skill.code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterType) {
      flat = flat.filter((skill) => skill.skill_tree_type === filterType);
    }

    return flat;
  }, [skillTree.tree, searchTerm, filterType]);

  const toggleSkillExpanded = (skillId: string) => {
    const newSet = new Set(expandedSkills);
    if (newSet.has(skillId)) {
      newSet.delete(skillId);
    } else {
      newSet.add(skillId);
    }
    setExpandedSkills(newSet);
  };

  const openSkillEditor = (skill: any = null) => {
    if (skill) {
      setFormData({
        code: skill.code,
        name: skill.name,
        description: skill.description || '',
        category: skill.category || '',
        skill_tree_type: skill.skill_tree_type || 'technical',
        parent_skill_id: skill.parent_skill_id || null,
        is_certification_required: skill.is_certification_required || false,
        certification_validity_months: skill.certification_validity_months || 12,
        icon_name: skill.icon_name || '',
      });
      setSelectedSkill(skill);
    } else {
      setFormData({
        code: '',
        name: '',
        description: '',
        category: '',
        skill_tree_type: 'technical',
        parent_skill_id: null,
        is_certification_required: false,
        certification_validity_months: 12,
        icon_name: '',
      });
      setSelectedSkill(null);
    }
    setEditDialogOpen(true);
  };

  const handleSaveSkill = async () => {
    if (!formData.code || !formData.name) {
      toast({
        title: 'Validation Error',
        description: 'Code and Name are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      let response;
      if (selectedSkill?.id) {
        // Update
        response = await fetch(`/api/skills/${selectedSkill.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      } else {
        // Create
        response = await fetch('/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save skill');
      }

      toast({
        title: 'Success',
        description: selectedSkill?.id ? 'Skill updated' : 'Skill created',
      });

      queryClient.invalidateQueries({ queryKey: ['skills'] });
      setEditDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteClick = (skill: any) => {
    setSkillToDelete(skill);
    setDeleteAlertOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!skillToDelete?.id) return;

    try {
      const response = await fetch(`/api/skills/${skillToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete skill');
      }

      toast({
        title: 'Success',
        description: 'Skill deleted successfully',
      });

      queryClient.invalidateQueries({ queryKey: ['skills'] });
      setDeleteAlertOpen(false);
      setSkillToDelete(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const renderSkillNode = (skill: any, level: number = 0) => {
    const hasChildren = skill.children && skill.children.length > 0;
    const isExpanded = expandedSkills.has(skill.id);

    return (
      <div key={skill.id} className="select-none">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
            selectedSkill?.id === skill.id
              ? 'bg-primary/10 border-primary'
              : 'border-transparent hover:bg-muted/50'
          }`}
          style={{ marginLeft: `${level * 16}px` }}
        >
          {hasChildren && (
            <button
              onClick={() => toggleSkillExpanded(skill.id)}
              className="p-0.5 hover:bg-muted rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-4" />}

          <div className="text-muted-foreground">{getTypeIcon(skill.skill_tree_type)}</div>

          <div
            className="flex-1 cursor-pointer"
            onClick={() => setSelectedSkill(skill)}
          >
            <div className="font-medium text-sm">{skill.name}</div>
            <div className="text-xs text-muted-foreground">{skill.code}</div>
          </div>

          <div className="flex items-center gap-1">
            {skill.is_active ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <X className="w-4 h-4 text-red-500" />
            )}
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => openSkillEditor(skill)}
          >
            <Edit2 className="w-4 h-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDeleteClick(skill)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {skill.children.map((child: any) =>
              renderSkillNode(child, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Skills Tree Manager</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading skill tree...</p>
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
              <TreePine className="w-5 h-5" />
              Skills Tech Tree Manager
            </CardTitle>
            <CardDescription>
              Customize your skill hierarchy and dependencies ({skillTree.total} skills)
            </CardDescription>
          </div>
          <Button onClick={() => openSkillEditor()} variant="default">
            <Plus className="mr-2 h-4 w-4" />
            New Skill
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tree">Skill Tree</TabsTrigger>
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="details">
              {selectedSkill ? 'Details' : 'Select a Skill'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tree" className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="flex-1">
                <Input
                  placeholder="Search skills..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select
                value={filterType ?? 'all'}
                onValueChange={(value) =>
                  setFilterType(value === 'all' ? undefined : value)
                }
              >
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {SKILL_TREE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg p-4 bg-muted/20 space-y-2 max-h-[600px] overflow-y-auto">
              {searchTerm || filterType ? (
                filteredSkills.length > 0 ? (
                  <div className="space-y-1">
                    {filteredSkills.map((skill) => renderSkillNode(skill, 0))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No skills found matching your search
                  </p>
                )
              ) : (
                <div className="space-y-1">
                  {skillTree.tree.map((skill: any) =>
                    renderSkillNode(skill, 0)
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="list" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SKILL_TREE_TYPES.map((type) => {
                const skillsOfType = filteredSkills.filter(
                  (s) => s.skill_tree_type === type.value
                );
                const TypeIcon = type.icon;

                return (
                  <Card key={type.value} className="border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TypeIcon className="w-4 h-4" />
                        {type.label}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {skillsOfType.length} skills
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {skillsOfType.map((skill: any) => (
                          <div
                            key={skill.id}
                            className="text-sm p-2 rounded border border-transparent hover:border-primary/30 hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => {
                              setSelectedSkill(skill);
                              setActiveTab('details');
                            }}
                          >
                            <div className="font-medium">{skill.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {skill.code}
                            </div>
                          </div>
                        ))}
                        {skillsOfType.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            No skills in this category
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="details">
            {selectedSkill ? (
              <SkillDetailsPanel
                skill={selectedSkill}
                onEdit={openSkillEditor}
                onDelete={handleDeleteClick}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Select a skill to view details</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedSkill?.id ? 'Edit Skill' : 'Create New Skill'}
            </DialogTitle>
            <DialogDescription>
              {selectedSkill?.id
                ? 'Update skill details'
                : 'Add a new skill to your tech tree'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="code">Code *</Label>
              <Input
                id="code"
                placeholder="e.g., OFFSET_PRESS_BASIC"
                value={formData.code}
                onChange={(e) =>
                  setFormData({ ...formData, code: e.target.value.toUpperCase() })
                }
              />
            </div>

            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Offset Press - Basic Operation"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this skill entails..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                placeholder="e.g., Offset Printing"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              />
            </div>

            <div>
              <Label htmlFor="skill_tree_type">Skill Type *</Label>
              <Select
                value={formData.skill_tree_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, skill_tree_type: value })
                }
              >
                <SelectTrigger id="skill_tree_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_TREE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="parent_skill_id">Parent Skill (Optional)</Label>
              <Select
                value={formData.parent_skill_id ?? 'none'}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    parent_skill_id: value === 'none' ? null : value,
                  })
                }
              >
                <SelectTrigger id="parent_skill_id">
                  <SelectValue placeholder="Select parent skill" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Root Level)</SelectItem>
                  {allSkills
                    .filter((s: any) => s.id !== selectedSkill?.id)
                    .map((skill: any) => (
                      <SelectItem key={skill.id} value={skill.id}>
                        {skill.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="certification_required"
                  checked={formData.is_certification_required}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      is_certification_required: checked as boolean,
                    })
                  }
                />
                <Label htmlFor="certification_required">
                  Certification Required
                </Label>
              </div>

              {formData.is_certification_required && (
                <div>
                  <Label htmlFor="certification_months">
                    Certification Validity (months)
                  </Label>
                  <Input
                    id="certification_months"
                    type="number"
                    min="1"
                    value={formData.certification_validity_months}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        certification_validity_months: parseInt(e.target.value) || 12,
                      })
                    }
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSkill}>Save Skill</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={deleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Skill?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{skillToDelete?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

// Skill Details Panel Component
const SkillDetailsPanel = ({ skill, onEdit, onDelete }: any) => {
  const { data: fullSkill = skill, isLoading } = useQuery({
    queryKey: ['skills', skill.id],
    queryFn: async () => {
      const res = await fetch(`/api/skills/${skill.id}`);
      if (!res.ok) throw new Error('Failed to fetch skill');
      return res.json();
    },
  });

  if (isLoading) {
    return <div className="py-4 text-muted-foreground">Loading details...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs uppercase text-muted-foreground">Code</Label>
          <p className="font-mono text-sm">{fullSkill.code}</p>
        </div>
        <div>
          <Label className="text-xs uppercase text-muted-foreground">Type</Label>
          <p className="text-sm capitalize">{fullSkill.skill_tree_type}</p>
        </div>
        <div>
          <Label className="text-xs uppercase text-muted-foreground">Category</Label>
          <p className="text-sm">{fullSkill.category || 'Uncategorized'}</p>
        </div>
        <div>
          <Label className="text-xs uppercase text-muted-foreground">
            Certification
          </Label>
          <p className="text-sm">
            {fullSkill.is_certification_required ? `Yes (${fullSkill.certification_validity_months}mo)` : 'No'}
          </p>
        </div>
      </div>

      {fullSkill.description && (
        <div>
          <Label className="text-xs uppercase text-muted-foreground">
            Description
          </Label>
          <p className="text-sm">{fullSkill.description}</p>
        </div>
      )}

      {fullSkill.children && fullSkill.children.length > 0 && (
        <div>
          <Label className="text-xs uppercase text-muted-foreground">
            Child Skills ({fullSkill.children.length})
          </Label>
          <div className="space-y-1">
            {fullSkill.children.map((child: any) => (
              <div key={child.id} className="text-sm p-2 bg-muted/50 rounded">
                {child.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {fullSkill.dependencies && fullSkill.dependencies.length > 0 && (
        <div>
          <Label className="text-xs uppercase text-muted-foreground">
            Prerequisites ({fullSkill.dependencies.length})
          </Label>
          <div className="space-y-1">
            {fullSkill.dependencies.map((dep: any) => (
              <div key={dep.id} className="text-sm p-2 bg-muted/50 rounded">
                <div className="font-medium">{dep.skills?.name}</div>
                <div className="text-xs text-muted-foreground">
                  Requires Level {dep.min_proficiency_required}
                  {!dep.is_hard_requirement && ' (Optional)'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onEdit(fullSkill)}
        >
          <Edit2 className="mr-2 h-4 w-4" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onDelete(fullSkill)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
};

export default SkillTreeManager;
