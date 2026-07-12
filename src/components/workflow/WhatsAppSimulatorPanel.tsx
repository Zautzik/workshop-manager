'use client';

/**
 * WhatsApp Simulator panel — send an operator message through the real
 * ingest pipeline without a phone. Renders only where the server says the
 * simulator is enabled (dev / WHATSAPP_SIMULATOR=true), so production
 * supervisors never see it.
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, Loader2, Send } from 'lucide-react';

interface SimResult {
  ok: boolean;
  summary: string;
}

const EXAMPLES = [
  'inicio 40501',
  'Fin 40501, 7.600 pliegos, 40 de merma, entro la 40500',
  'cancelar 40501 me equivoque',
];

export default function WhatsAppSimulatorPanel() {
  const [enabled, setEnabled] = useState(false);
  const [from, setFrom] = useState('+56 9 5111 0005');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SimResult[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch('/api/whatsapp/simulate', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEnabled(!!d?.enabled))
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  const describe = (payload: any): string => {
    if (payload?.status === 'multi') {
      return (payload.events as any[])
        .map((e) => e.message ?? e.error ?? e.status)
        .join(' · ');
    }
    return payload?.message ?? payload?.error ?? payload?.reason ?? JSON.stringify(payload);
  };

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          from,
          body: body.trim(),
          ...(mediaUrl.trim() ? { media_url: mediaUrl.trim() } : {}),
        }),
      });
      const payload = await res.json().catch(() => null);
      const suffix = payload?.media
        ? payload.media.attached
          ? ' · 📎 foto adjuntada'
          : ` · 📎 foto NO adjuntada (${payload.media.reason})`
        : '';
      setResults((prev) => [{ ok: res.ok, summary: describe(payload) + suffix }, ...prev].slice(0, 6));
      setBody('');
      setMediaUrl('');
      // The review queue and logs are now stale — refetch them.
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
    } catch {
      setResults((prev) => [{ ok: false, summary: 'Error de red enviando el mensaje' }, ...prev].slice(0, 6));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-dashed border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-amber-500" />
          Simulador de mensajes (solo desarrollo)
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/40">demo</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <div className="space-y-1">
            <Label htmlFor="sim-from" className="text-xs">Teléfono del operador</Label>
            <Input id="sim-from" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sim-body" className="text-xs">Mensaje</Label>
            <Textarea
              id="sim-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={EXAMPLES[1]}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-1">
            <Label htmlFor="sim-media" className="text-xs">URL de foto (opcional — evidencia para el expediente)</Label>
            <Input
              id="sim-media"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://…/foto.jpg"
              className="h-9"
            />
          </div>
          <Button onClick={send} disabled={sending || !body.trim()} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setBody(ex)}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
        {results.length > 0 && (
          <div className="space-y-1 pt-1">
            {results.map((r, i) => (
              <p key={i} className={`text-xs whitespace-pre-line ${r.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                {r.ok ? '✓' : '✗'} {r.summary}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
