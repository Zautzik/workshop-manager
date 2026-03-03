'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, Image, FileText, X, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'application/pdf',
  'application/postscript', // .ai, .eps
  'image/tiff',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return <Image className="h-5 w-5 text-blue-400" />;
  if (type === 'application/pdf') return <FileText className="h-5 w-5 text-red-400" />;
  return <FileText className="h-5 w-5 text-muted-foreground" />;
}

export function ArtworkUpload({ files, onFilesChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const addFiles = (newFiles: FileList | File[]) => {
    const valid = Array.from(newFiles).filter((f) => {
      if (f.size > MAX_FILE_SIZE) return false;
      // Accept all common design files
      return true;
    });

    const combined = [...files, ...valid];
    onFilesChange(combined);

    // Generate previews for images
    for (const f of valid) {
      if (f.type.startsWith('image/') && f.size < 5 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreviews((prev) => ({ ...prev, [f.name + f.size]: e.target?.result as string }));
        };
        reader.readAsDataURL(f);
      }
    }
  };

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    onFilesChange(updated);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
          dragOver
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary/40 bg-card/30'
        )}
      >
        <Upload className={cn('h-8 w-8 mx-auto mb-2', dragOver ? 'text-primary' : 'text-muted-foreground')} />
        <p className="text-sm font-medium text-foreground">
          Arrastra archivos aquí o{' '}
          <span className="text-primary underline">busca en tu computador</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, AI, EPS, PSD, TIFF, PNG, JPG — máx. 50 MB por archivo
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.ai,.eps,.psd,.tif,.tiff,.png,.jpg,.jpeg,.svg"
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, idx) => {
            const previewKey = file.name + file.size;
            const preview = previews[previewKey];
            return (
              <Card key={previewKey} className="p-3 flex items-center gap-3 border-border bg-card/50">
                {preview ? (
                  <div className="w-10 h-10 rounded overflow-hidden shrink-0 border border-border">
                    <img src={preview} alt={file.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                    {getFileIcon(file.type)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(idx);
                  }}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </Card>
            );
          })}
          <p className="text-xs text-muted-foreground text-center">
            {files.length} archivo{files.length !== 1 ? 's' : ''} adjunto{files.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
