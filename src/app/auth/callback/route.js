import { supabase } from '@/integrations/supabase/client'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Redirect to password setup page
  return NextResponse.redirect(new URL('/auth/set-password', request.url))
}