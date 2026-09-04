'use client';
/**
 * useRealtimeProduction
 *
 * Lee el estado de conexión del channel único de Supabase Realtime que
 * `RealtimeProductionProvider` (src/contexts/RealtimeProductionContext.tsx)
 * monta una vez en src/app/operaciones/layout.tsx. Este archivo existía
 * antes como el hook que abría el channel él mismo -- cada uno de los cuatro
 * consumidores (HojaProduccion, OrdenesEnProceso, PlanSemanal, PlantaBoard)
 * lo llamaba por su cuenta, con un comentario ("llamar una sola vez") que
 * nada hacía cumplir. Se movió la suscripción al Provider para que "una sola
 * vez" sea estructural (auditoría de rendimiento 2026-09-08); este archivo
 * se conserva sólo para no tener que tocar el import de los cuatro
 * consumidores.
 *
 * Usage: const { isConnected } = useRealtimeProduction();
 */

export { useRealtimeProductionContext as useRealtimeProduction } from '@/contexts/RealtimeProductionContext';
