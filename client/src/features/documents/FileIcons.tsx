import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DocumentFile } from '../../../../shared/types';
import { cn } from '../../lib/cn';
import { fileKind, fileUrl } from './api';

const KIND_ICON: Record<string, LucideIcon> = {
  Image: FileImage,
  PDF: FileText,
  Text: FileText,
  Document: FileText,
  Slides: FileText,
  Audio: FileAudio,
  Video: FileVideo,
  Spreadsheet: FileSpreadsheet,
  Archive: FileArchive,
};

export const fileIcon = (doc: Pick<DocumentFile, 'mime' | 'name'>): LucideIcon =>
  KIND_ICON[fileKind(doc.mime, doc.name)] ?? File;

/** The thumbnail when there is one, otherwise an icon for the kind of file. */
export function FileThumb({ doc, size = 'sm' }: { doc: DocumentFile; size?: 'sm' | 'lg' }) {
  const box = size === 'sm' ? 'h-10 w-10' : 'aspect-[4/3] w-full';
  if (doc.hasThumb) {
    return (
      <img
        src={fileUrl(doc.id, { thumb: true })}
        alt=""
        loading="lazy"
        draggable={false}
        className={cn(box, 'shrink-0 rounded-sm bg-surface-2 object-cover')}
      />
    );
  }
  const Icon = fileIcon(doc);
  return (
    <div
      className={cn(
        box,
        'flex shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-faint',
      )}
    >
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-7 w-7'} strokeWidth={1.5} />
    </div>
  );
}

/** Folders get a filled, accent-tinted glyph so they never read as files. */
export function FolderGlyph({ className }: { className?: string }) {
  return (
    <Folder
      className={cn('h-5 w-5 shrink-0 fill-accent/25 text-accent', className)}
      strokeWidth={1.5}
      aria-hidden
    />
  );
}
