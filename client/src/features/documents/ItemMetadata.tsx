import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { DocumentFile, DocumentFolder } from '../../../../shared/types';
import { MetadataDialog, timeRow, type MetadataSection } from '../../components/ui/Metadata';
import { useLinks } from '../links/api';
import { fileKind, fileUrl, folderUsage, formatSize, useFolderSizes } from './api';
import { usageLabel } from './DeleteFolderDialog';
import { locationLabel, type FolderTree } from './folderTree';

const nf = new Intl.NumberFormat();
const pending = <span className="text-ink-faint">…</span>;

const bytesRow = (label: string, bytes: number) => ({
  label,
  value: formatSize(bytes),
  hint: `${nf.format(bytes)} bytes`,
});

/** Pixel size of a stored image, read from the (cached) file itself. */
function useImageSize(file: DocumentFile | null) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const isImage = !!file?.previewable && file.mime.startsWith('image/');
  const id = file?.id;
  useEffect(() => {
    setSize(null);
    if (!id || !isImage) return;
    const img = new Image();
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = fileUrl(id);
    return () => {
      img.onload = null;
    };
  }, [id, isImage]);
  return { isImage, size };
}

/** Everything known about one stored file. */
export function FileMetadata({
  file,
  tree,
  onClose,
}: {
  file: DocumentFile | null;
  tree: FolderTree;
  onClose: () => void;
}) {
  const links = useLinks(file ? { type: 'document', id: file.id } : null);
  const image = useImageSize(file);
  if (!file) return null;
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : null;

  const sections: MetadataSection[] = [
    {
      title: 'File',
      rows: [
        { label: 'Kind', value: fileKind(file.mime, file.name) },
        { label: 'Format', value: file.mime, hint: ext ? `.${ext}` : undefined },
        bytesRow('Size', file.size),
        image.isImage && {
          label: 'Dimensions',
          value: image.size
            ? `${nf.format(image.size.w)} × ${nf.format(image.size.h)} px`
            : pending,
        },
        { label: 'Location', value: locationLabel(tree, file.folderId) },
      ],
    },
    {
      title: 'Dates',
      rows: [
        timeRow('Uploaded', file.createdAt),
        file.updatedAt !== file.createdAt && {
          ...timeRow('Last changed', file.updatedAt)!,
          hint: 'Name, folder, tags or star. The file itself never changes.',
        },
      ],
    },
    {
      title: 'Organisation',
      rows: [
        { label: 'Starred', value: file.favorite ? 'Yes' : 'No' },
        { label: 'Tags', value: file.tags.length ? file.tags.join(', ') : 'None' },
        { label: 'Preview', value: file.previewable ? 'Opens in the browser' : 'Download only' },
        { label: 'Thumbnail', value: file.hasThumb ? 'Yes' : 'No' },
        {
          label: 'Linked items',
          value: links.data ? nf.format(links.data.length) : links.isError ? '—' : pending,
        },
      ],
    },
    {
      title: 'Identity',
      rows: [
        { label: 'ID', value: <span className="select-all font-mono text-xs">{file.id}</span> },
      ],
    },
  ];
  return <MetadataDialog open onClose={onClose} name={file.name} sections={sections} />;
}

/** Everything known about one folder, including what it holds through every level. */
export function FolderMetadata({
  folder,
  tree,
  onClose,
}: {
  folder: DocumentFolder | null;
  tree: FolderTree;
  onClose: () => void;
}) {
  const sizes = useFolderSizes();
  const usage = useQuery({
    // Keyed under 'documents' so any documents change refreshes it.
    queryKey: ['documents', 'usage', folder?.id],
    queryFn: () => folderUsage([folder!.id]),
    enabled: !!folder,
  });
  const links = useLinks(folder ? { type: 'folder', id: folder.id } : null);
  if (!folder) return null;
  const stored = sizes.data?.folders[folder.id]?.bytes ?? 0;

  const sections: MetadataSection[] = [
    {
      title: 'Folder',
      rows: [
        { label: 'Location', value: locationLabel(tree, folder.parentId) },
        {
          label: 'Contains',
          value: usage.data
            ? usageLabel(usage.data) || 'Nothing yet'
            : usage.isError
              ? '—'
              : pending,
          hint: 'Counted through every folder inside it',
        },
        sizes.data
          ? bytesRow('Stored', stored)
          : { label: 'Stored', value: sizes.isError ? '—' : pending },
      ],
    },
    {
      title: 'Dates',
      rows: [
        timeRow('Created', folder.createdAt),
        folder.updatedAt !== folder.createdAt && timeRow('Last changed', folder.updatedAt),
      ],
    },
    {
      title: 'Organisation',
      rows: [
        {
          label: 'Linked items',
          value: links.data ? nf.format(links.data.length) : links.isError ? '—' : pending,
        },
      ],
    },
    {
      title: 'Identity',
      rows: [
        { label: 'ID', value: <span className="select-all font-mono text-xs">{folder.id}</span> },
      ],
    },
  ];
  return <MetadataDialog open onClose={onClose} name={folder.name} sections={sections} />;
}
