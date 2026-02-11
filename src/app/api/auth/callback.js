import { supabase } from '@/integrations/supabase/client'

export default async function handler(req, res) {
  const { code } = req.query

  if (code) {
    
    await supabase.auth.exchangeCodeForSession(code)
  }

  res.redirect('/auth/set-password')
}