import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Admin control over a user's password.
 *
 * Two things an administrator legitimately needs: set a password directly (the
 * operator is standing at the desk having forgotten theirs), or send a recovery
 * link so the person chooses their own without anyone else ever knowing it.
 *
 * What is deliberately NOT here — and cannot be built: reading an existing
 * password. Supabase Auth stores a one-way hash, which is the correct design;
 * there is nothing to read. An admin can replace a password, never see it.
 *
 * Every change revokes the user's existing sessions. A password reset that
 * leaves the old session alive doesn't lock anyone out, which defeats the point
 * when the reason for the reset is that the account may be compromised.
 */
const PasswordActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set'),
    user_id: z.string().uuid(),
    password: z
      .string()
      .min(10, 'Usa al menos 10 caracteres')
      .max(200, 'Máximo 200 caracteres')
      .refine((p) => /[a-z]/i.test(p), 'Incluye al menos una letra')
      .refine((p) => /[0-9]/.test(p), 'Incluye al menos un número'),
  }),
  z.object({
    action: z.literal('send_recovery'),
    user_id: z.string().uuid(),
  }),
]);

export async function POST(req: NextRequest) {
  // Only administrators. Not supervisor, not manager: this is account takeover
  // capability by design, so the blast radius stays with the owner of the system.
  const auth = await requireAuth('admin');
  if (isAuthError(auth)) return auth;

  const actorId = typeof auth === 'object' && 'id' in auth ? auth.id : null;

  // Throttled: a password endpoint is the one worth hammering if a session
  // is ever stolen.
  const rl = enforceRouteRateLimit({
    req,
    key: `admin:password:${buildRateLimitActor(req, actorId ?? undefined)}`,
    limit: 10,
    windowMs: 60_000,
    message: 'Demasiados cambios de contraseña seguidos. Espera un momento.',
  });
  if (rl) return rl;

  try {
    const parsed = PasswordActionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { user_id, action } = parsed.data;

    const { data: target, error: lookupError } =
      await supabaseAdmin.auth.admin.getUserById(user_id);

    if (lookupError || !target?.user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const email = target.user.email;

    if (action === 'send_recovery') {
      if (!email) {
        return NextResponse.json(
          { error: 'Ese usuario no tiene correo; asígnale una contraseña directamente.' },
          { status: 400 }
        );
      }

      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      console.info(
        `[admin] recovery link generated for ${email} by ${actorId ?? 'unknown admin'}`
      );

      return NextResponse.json({
        ok: true,
        action: 'send_recovery',
        email,
        // The admin may need to hand this over in person — this plant does not
        // have reliable email for every operator.
        recovery_link: data?.properties?.action_link ?? null,
      });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: parsed.data.password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Kill every existing session so the new password is the only way in.
    const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(user_id, 'global');
    if (signOutError) {
      console.warn('Password changed but sessions were not revoked:', signOutError.message);
    }

    console.info(`[admin] password reset for ${email} by ${actorId ?? 'unknown admin'}`);

    return NextResponse.json({
      ok: true,
      action: 'set',
      email,
      sessions_revoked: !signOutError,
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo cambiar la contraseña' }, { status: 500 });
  }
}
