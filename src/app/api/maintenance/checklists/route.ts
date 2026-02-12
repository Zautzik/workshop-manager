/**
 * @fileoverview Maintenance Checklist API Route
 * 
 * SYSTEM ROLE: Data Persistence & API Gateway for Checklists
 * ORGAN ANALOGY: The "Memory Bank" - Stores and retrieves checklist templates
 * 
 * Endpoints:
 * - GET /api/maintenance/checklists - Fetch all checklists
 * - POST /api/maintenance/checklists - Create new checklist
 * - PATCH /api/maintenance/checklists/{id} - Update checklist
 * - DELETE /api/maintenance/checklists/{id} - Delete checklist
 */

import { supabaseAdmin as supabase } from '@/integrations/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('maintenance_checklists')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching checklists:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name?.trim() || !body.machineType?.trim()) {
      return NextResponse.json(
        { error: 'name and machineType are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('maintenance_checklists')
      .insert([
        {
          name: body.name,
          machine_type: body.machineType,
          maintenance_type: body.maintenanceType || 'preventive',
          items: body.items || [],
          total_estimated_time: body.totalEstimatedTime || 0,
        },
      ])
      .select();

    if (error) throw error;

    return NextResponse.json(data[0], { status: 201 });
  } catch (error: any) {
    console.error('Error creating checklist:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, ...body } = await request.json();

    const { data, error } = await supabase
      .from('maintenance_checklists')
      .update({
        name: body.name,
        machine_type: body.machineType,
        maintenance_type: body.maintenanceType,
        items: body.items,
        total_estimated_time: body.totalEstimatedTime,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select();

    if (error) throw error;

    return NextResponse.json(data[0]);
  } catch (error: any) {
    console.error('Error updating checklist:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('maintenance_checklists')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting checklist:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
