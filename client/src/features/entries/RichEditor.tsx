import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Marked } from 'marked';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ExternalLink, FolderClosed, Link2, Paperclip, Unlink } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { parseAnchorUrl, type AnchorRef } from '../../lib/anchors';
import { cn } from '../../lib/cn';
import { hrefFor } from '../../lib/routes';
import { useDocument, useFolders } from '../library/api';
import type { FormatAction, MarkdownEditorHandle } from './MarkdownEditor';
import { proseClass, type WritingFont } from './writingStyle';

// Its own instance: the editor's Markdown support adds rules to the shared one.
const reference = new Marked({ gfm: true });

/**
 * What a Markdown text renders to, ignoring layout whitespace and the extra spacing of list
 * items separated by blank lines (the editor writes lists without them).
 */
const rendered = (md: string) =>
  (reference.parse(md, { async: false }) as string)
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .replace(/<li><p>/g, '<li>')
    .replace(/<\/p><\/li>/g, '</li>');

/**
 * True when the editor keeps a text as it reads: what it would save renders exactly like the
 * original. Anything it can't represent (images, raw HTML, footnotes) fails this, and then the
 * plain editor is used, so writing here can never quietly lose or change text.
 */
function keepsAllText(editor: Editor, md: string) {
  if (/\[\^[^\]]+\]/.test(md)) return false; // footnotes: read with remark-gfm, unknown here
  return rendered(editor.getMarkdown()) === rendered(md);
}

function activeFormats(editor: Editor): Set<FormatAction> {
  const out = new Set<FormatAction>();
  if (editor.isActive('heading')) out.add('heading');
  if (editor.isActive('bold')) out.add('bold');
  if (editor.isActive('italic')) out.add('italic');
  if (editor.isActive('blockquote')) out.add('quote');
  if (editor.isActive('bulletList') && !editor.isActive('taskList')) out.add('list');
  if (editor.isActive('taskList')) out.add('check');
  if (editor.isActive('link')) {
    const href = String(editor.getAttributes('link').href ?? '');
    out.add(parseAnchorUrl(href) ? 'file' : 'link');
  }
  return out;
}

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

/**
 * The formatted writing view: the text looks as it does when read (headings, lists, quotes,
 * words linked to files), while it is still stored as Markdown. Toolbar buttons show what is
 * applied at the selection and remove it when pressed again. Putting the cursor in a link
 * offers to open it or remove it.
 */
const RichEditor = forwardRef<
  MarkdownEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    font: WritingFont;
    placeholder?: string;
    ariaLabel: string;
    minRows?: number;
    /** Put the cursor in it right away (a new entry). */
    autoFocus?: boolean;
    /** Formatting at the selection changed (for the toolbar). */
    onActive?: (active: Set<FormatAction>) => void;
    /** This text has something the editor can't show; switch to the plain editor. */
    onUnsupported: () => void;
  }
>(function RichEditor(
  {
    value,
    onChange,
    font,
    placeholder,
    ariaLabel,
    minRows = 8,
    autoFocus,
    onActive,
    onUnsupported,
  },
  ref,
) {
  const lastEmitted = useRef(value);
  const lastActive = useRef(new Set<FormatAction>());
  const callbacks = useRef({ onChange, onActive, onUnsupported });
  callbacks.current = { onChange, onActive, onUnsupported };

  const report = (editor: Editor) => {
    const next = activeFormats(editor);
    if (sameSet(next, lastActive.current)) return;
    lastActive.current = next;
    callbacks.current.onActive?.(next);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Markdown has no underline, so it couldn't be saved.
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          // Words linked to a library file or folder use in-app addresses.
          isAllowedUri: (url, ctx) => !!parseAnchorUrl(url) || ctx.defaultValidate(url),
          HTMLAttributes: { target: null, rel: null },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      Markdown,
    ],
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: cn(proseClass(font), 'text-ink caret-accent'),
        // The same type as the reading view (see `proseStyle`), as a style attribute.
        style: `${font === 'serif' ? "font-variation-settings: 'opsz' 16" : '--entry-size: 1.0625rem'}; min-height: ${minRows * 1.75}em`,
        'aria-label': ariaLabel,
        spellcheck: 'true',
        autocapitalize: 'sentences',
      },
    },
    onCreate: ({ editor: e }) => {
      if (!keepsAllText(e, value)) callbacks.current.onUnsupported();
    },
    onUpdate: ({ editor: e }) => {
      // Without the blank lines of the empty paragraph the editor keeps at the very end.
      const md = e.getMarkdown().replace(/\n+$/, '');
      lastEmitted.current = md;
      callbacks.current.onChange(md);
    },
    onSelectionUpdate: ({ editor: e }) => report(e),
    onTransaction: ({ editor: e }) => report(e),
  });

  // Text replaced from outside (another device, a restored version): show it.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    if (!keepsAllText(editor, value)) callbacks.current.onUnsupported();
  }, [editor, value]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus(undefined, { scrollIntoView: false }),
      format: (action) => {
        if (!editor) return;
        const c = editor.chain().focus();
        switch (action) {
          case 'bold':
            return void c.toggleBold().run();
          case 'italic':
            return void c.toggleItalic().run();
          case 'heading':
            return void (editor.isActive('heading')
              ? c.setParagraph().run()
              : c.toggleHeading({ level: 2 }).run());
          case 'quote':
            return void c.toggleBlockquote().run();
          case 'list':
            return void c.toggleBulletList().run();
          case 'check':
            return void c.toggleTaskList().run();
          case 'clear':
            return void c.unsetAllMarks().clearNodes().run();
          default:
            return;
        }
      },
      selection: () => {
        const s = editor?.state.selection;
        return { start: s?.from ?? 0, end: s?.to ?? 0 };
      },
      textOf: (r) => (editor ? editor.state.doc.textBetween(r.start, r.end, ' ') : ''),
      linkRange: (r, url, fallback) => {
        if (!editor) return;
        if (r.start === r.end) {
          editor
            .chain()
            .focus()
            .insertContentAt(r.start, [
              { type: 'text', text: fallback, marks: [{ type: 'link', attrs: { href: url } }] },
              { type: 'text', text: ' ' },
            ])
            .run();
          return;
        }
        editor
          .chain()
          .focus()
          .setTextSelection({ from: r.start, to: r.end })
          .setLink({ href: url })
          .setTextSelection(r.end)
          .unsetMark('link')
          .run();
      },
      active: () => (editor ? activeFormats(editor) : new Set()),
      unlink: () => void editor?.chain().focus().extendMarkRange('link').unsetLink().run(),
    }),
    [editor],
  );

  if (!editor) return null;
  return (
    <>
      <EditorContent editor={editor} />
      <LinkPopover editor={editor} />
    </>
  );
});

export default RichEditor;

/**
 * While the cursor is in a link: a small bar under it with where the link goes, Open and
 * Unlink. Placed by hand and kept inside the screen, so it works the same on a phone.
 */
function LinkPopover({ editor }: { editor: Editor }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [href, setHref] = useState('');
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const place = () => {
      if (!editor.isFocused || !editor.isActive('link')) return setAt(null);
      const c = editor.view.coordsAtPos(editor.state.selection.from);
      setHref(String(editor.getAttributes('link').href ?? ''));
      setAt({ left: c.left, top: c.bottom + 6 });
    };
    const hide = () => setAt(null);
    editor.on('selectionUpdate', place);
    editor.on('transaction', place);
    editor.on('focus', place);
    editor.on('blur', hide);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      editor.off('selectionUpdate', place);
      editor.off('transaction', place);
      editor.off('focus', place);
      editor.off('blur', hide);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [editor]);

  // Keep it inside the screen: shift left if it would run past the right edge. Its width
  // changes once the linked file's name has loaded, so measure again whenever it does.
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || !at) return;
    const clamp = () => {
      const max = window.innerWidth - el.offsetWidth - 8;
      el.style.left = `${Math.max(8, Math.min(at.left, max))}px`;
    };
    clamp();
    const watch = new ResizeObserver(clamp);
    watch.observe(el);
    return () => watch.disconnect();
  }, [at, href]);

  if (!at || !href) return null;
  return (
    <div
      ref={bar}
      className="fixed z-40 w-max"
      style={{ top: at.top, left: at.left }}
      // Keep the cursor (and so the bar) in the editor while pressing its buttons.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <LinkBar editor={editor} href={href} />
    </div>
  );
}

function LinkBar({ editor, href }: { editor: Editor; href: string }) {
  const anchor = parseAnchorUrl(href);
  const navigate = useNavigate();
  const open = () => {
    if (anchor) navigate(hrefFor(anchor.type, anchor.id));
    else window.open(href, '_blank', 'noopener,noreferrer');
  };
  const Icon = anchor ? (anchor.type === 'folder' ? FolderClosed : Paperclip) : Link2;

  return (
    <div className="flex max-w-[calc(100vw-2rem)] items-center gap-0.5 rounded-md border border-line bg-raised py-1 pl-2.5 pr-1 font-sans text-[0.8125rem] shadow-[0_8px_24px_-8px_rgb(0_0_0/0.5)]">
      <Icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
      <span className="mx-1.5 min-w-0 max-w-[10rem] truncate text-ink-muted sm:max-w-[14rem]">
        {anchor ? <AnchorName anchor={anchor} /> : href}
      </span>
      <button
        type="button"
        onClick={open}
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded px-2 text-ink hover:bg-surface-2 sm:h-7"
      >
        <ExternalLink className="h-3.5 w-3.5" /> Open
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded px-2 text-ink hover:bg-surface-2 sm:h-7"
      >
        <Unlink className="h-3.5 w-3.5" /> Unlink
      </button>
    </div>
  );
}

function AnchorName({ anchor }: { anchor: AnchorRef }) {
  const doc = useDocument(anchor.type === 'document' ? anchor.id : null);
  const folders = useFolders();
  if (anchor.type === 'folder')
    return <>{folders.data?.find((f) => f.id === anchor.id)?.name ?? 'Folder'}</>;
  return <>{doc.data?.name ?? (doc.isError ? 'File not found' : 'File')}</>;
}
