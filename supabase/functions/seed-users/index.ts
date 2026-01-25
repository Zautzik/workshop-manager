import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Create supervisor user
    const { data: supervisor, error: supervisorError } = await supabase.auth.admin.createUser({
      email: 'supervisor1@printpress.com',
      password: 'pass',
      email_confirm: true,
    })

    if (supervisorError && !supervisorError.message.includes('already registered')) {
      throw supervisorError
    }

    if (supervisor.user) {
      // Add supervisor role
      await supabase
        .from('user_roles')
        .upsert({
          user_id: supervisor.user.id,
          role: 'supervisor'
        }, {
          onConflict: 'user_id,role'
        })
    }

    // Create manager user
    const { data: manager, error: managerError } = await supabase.auth.admin.createUser({
      email: 'manager1@printpress.com',
      password: 'pass',
      email_confirm: true,
    })

    if (managerError && !managerError.message.includes('already registered')) {
      throw managerError
    }

    if (manager.user) {
      // Add manager role
      await supabase
        .from('user_roles')
        .upsert({
          user_id: manager.user.id,
          role: 'manager'
        }, {
          onConflict: 'user_id,role'
        })
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Users seeded successfully',
        users: {
          supervisor: 'supervisor1@printpress.com / pass',
          manager: 'manager1@printpress.com / pass'
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})