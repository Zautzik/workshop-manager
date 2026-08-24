'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ScanLine, LogIn, LogOut, UserCheck, CheckCircle2, XCircle, AlertTriangle, ArrowLeft, Factory, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Present { employee_id: string; full_name: string | null }
interface LastResult { name: string; ok: boolean; mode: 'clock_in' | 'clock_out' }
interface MachineOption { id: string; name: string }

/**
 * Qué máquina es esta estación.
 *
 * El kiosko nunca supo — mandaba entrada/salida sin decir de qué máquina, así
 * que cada hora fichada quedaba sin cómo atribuirse a una OT (2026-08 audit).
 * Un kiosko vive atornillado junto a una máquina física, así que la respuesta
 * se pregunta una vez y se guarda en ESTE dispositivo — localStorage es lo
 * correcto acá porque es identidad del aparato, no un dato del taller.
 */
const STATION_MACHINE_KEY = 'estacion_machine_id';
const STATION_MACHINE_NAME_KEY = 'estacion_machine_name';

export default function EstacionPage() {
  const [mode, setMode] = useState<'clock_in' | 'clock_out'>('clock_in');
  const [code, setCode] = useState('');
  const [last, setLast] = useState<LastResult | null>(null);
  const [present, setPresent] = useState<Present[]>([]);
  const [pendingMigration, setPendingMigration] = useState(false);
  const [stationMachineId, setStationMachineId] = useState<string | null>(null);
  const [stationMachineName, setStationMachineName] = useState<string | null>(null);
  const [pickingMachine, setPickingMachine] = useState(false);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = localStorage.getItem(STATION_MACHINE_KEY);
    const name = localStorage.getItem(STATION_MACHINE_NAME_KEY);
    if (id) { setStationMachineId(id); setStationMachineName(name); }
    else setPickingMachine(true);
  }, []);

  useEffect(() => {
    if (!pickingMachine) return;
    (async () => {
      try {
        const res = await fetch('/api/machines', { credentials: 'include' });
        if (res.ok) setMachines(await res.json());
      } catch { /* ignore — el selector queda vacío, se puede reintentar */ }
    })();
  }, [pickingMachine]);

  const chooseMachine = (m: MachineOption) => {
    localStorage.setItem(STATION_MACHINE_KEY, m.id);
    localStorage.setItem(STATION_MACHINE_NAME_KEY, m.name);
    setStationMachineId(m.id);
    setStationMachineName(m.name);
    setPickingMachine(false);
  };

  const loadPresent = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance/clock', { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setPresent(d.present ?? []);
        setPendingMigration(!!d.pending_migration);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadPresent(); inputRef.current?.focus(); }, [loadPresent]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    setCode('');
    try {
      const res = await fetch('/api/attendance/clock', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'qr', value, event_type: mode, machine_id: stationMachineId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setLast({ name: data.employee?.full_name ?? 'Operario', ok: true, mode });
        loadPresent();
      } else {
        setLast({ name: data.error ?? 'No reconocido', ok: false, mode });
        if (res.status === 503) setPendingMigration(true);
      }
    } catch {
      setLast({ name: 'Error de conexión', ok: false, mode });
    }
    inputRef.current?.focus();
    setTimeout(() => setLast(null), 4000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background flex flex-col items-center justify-center p-6">
      {/* AppShell treats /estacion as a fullscreen route, so there is no sidebar
          or breadcrumb to navigate back with — this link is the only way out. */}
      <Link
        href="/operaciones"
        className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al panel
      </Link>

      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-3">
            <ScanLine className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Estación de Fichaje</h1>
          <p className="text-muted-foreground mt-1">Escanea tu credencial QR para registrar tu jornada</p>
          {stationMachineId && !pickingMachine && (
            <button
              onClick={() => setPickingMachine(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Factory className="h-3 w-3" /> {stationMachineName ?? 'Máquina sin nombre'} <Pencil className="h-3 w-3 opacity-60" />
            </button>
          )}
        </div>

        {/* Primera vez en este dispositivo: sin saber la máquina, el fichaje
            queda sin cómo atribuirse a una OT — se pregunta antes de fichar,
            no después. */}
        {pickingMachine && (
          <div className="mb-6 rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
            <p className="text-center text-lg font-semibold text-foreground mb-1">¿Qué máquina es esta estación?</p>
            <p className="text-center text-sm text-muted-foreground mb-4">Se guarda en este dispositivo — no hay que elegirla de nuevo.</p>
            {machines.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">Cargando máquinas…</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {machines.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => chooseMachine(m)}
                    className="rounded-lg border-2 border-border bg-card px-3 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/10"
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
            {stationMachineId && (
              <button
                onClick={() => setPickingMachine(false)}
                className="mt-3 block w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar — seguir con {stationMachineName}
              </button>
            )}
          </div>
        )}

        {/* Entrada / Salida toggle */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => { setMode('clock_in'); inputRef.current?.focus(); }}
            className={cn('flex items-center justify-center gap-2 rounded-xl border-2 py-4 text-lg font-semibold transition-colors',
              mode === 'clock_in' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-border text-muted-foreground hover:bg-muted/40')}
          >
            <LogIn className="h-5 w-5" /> Entrada
          </button>
          <button
            onClick={() => { setMode('clock_out'); inputRef.current?.focus(); }}
            className={cn('flex items-center justify-center gap-2 rounded-xl border-2 py-4 text-lg font-semibold transition-colors',
              mode === 'clock_out' ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-border text-muted-foreground hover:bg-muted/40')}
          >
            <LogOut className="h-5 w-5" /> Salida
          </button>
        </div>

        {/* Scan input */}
        <form onSubmit={submit}>
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Escanea o ingresa el código…"
            autoComplete="off"
            className="w-full rounded-xl border-2 border-border bg-card px-5 py-5 text-center text-2xl tracking-widest font-mono outline-none focus:border-primary"
          />
        </form>

        {/* Result flash */}
        {last && (
          <div className={cn('mt-4 flex items-center justify-center gap-3 rounded-xl p-5 text-xl font-semibold',
            last.ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400')}>
            {last.ok ? <CheckCircle2 className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
            <span>
              {last.ok
                ? `${last.mode === 'clock_in' ? 'Bienvenido' : 'Hasta luego'}, ${last.name}`
                : last.name}
            </span>
          </div>
        )}

        {pendingMigration && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            El registro de asistencia no está respondiendo. Avisa a un administrador.
          </div>
        )}

        {/* Present now */}
        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2 flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5" /> En turno ({present.length})
          </p>
          {present.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie ha fichado entrada todavía.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {present.map((p) => (
                <span key={p.employee_id} className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 text-sm font-medium">
                  {p.full_name ?? 'Operario'}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
