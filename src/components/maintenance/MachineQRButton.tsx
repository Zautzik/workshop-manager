'use client';

/**
 * MachineQRButton — renders a small QR icon button that opens a dialog
 * showing a QR code linking to /maintenance/maquinas?id=<machineId>
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

  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/maintenance/maquinas?id=${machineId}`
      : `/maintenance/maquinas?id=${machineId}`;

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
            <div className="p-3 bg-white rounded-lg border">
              <QRCodeSVG value={url} size={180} level="M" />
            </div>
            <p className="text-[10px] text-muted-foreground text-center break-all">{url}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
