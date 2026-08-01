'use client';

/**
 * QR pegado en la máquina → anotar la lectura del contador desde el teléfono.
 *
 * Apuntaba a `/maintenance/maquinas?id=…`, una ruta que NO EXISTE: el módulo se
 * llama `/equipos` desde hace tiempo y el QR nunca se actualizó, así que
 * cualquier etiqueta impresa llevaba a un 404.
 *
 * Ahora apunta a la pantalla de lectura, que es lo único que alguien necesita
 * hacer parado frente al equipo.
 */

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { QrCode } from 'lucide-react';

interface MachineQRButtonProps {
  machineId: string;
  machineName: string;
}

export function MachineQRButton({ machineId, machineName }: MachineQRButtonProps) {
  const [open, setOpen] = useState(false);

  const path = `/equipos/lectura/${machineId}`;
  const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        title="Ver QR del equipo"
        onClick={() => setOpen(true)}
      >
        <QrCode className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">QR — {machineName}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {/* Fondo blanco fijo: un QR sobre fondo oscuro no lo lee ningún
                teléfono, y esta etiqueta se imprime. */}
            <div className="rounded-lg border bg-white p-3">
              <QRCodeSVG value={url} size={180} level="M" />
            </div>
            <p className="text-center text-xs font-medium">{machineName}</p>
            <p className="text-center text-[11px] text-muted-foreground">
              Escanéalo con el teléfono para anotar la lectura del contador.
            </p>
            <p className="break-all text-center text-[10px] text-muted-foreground">{url}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
