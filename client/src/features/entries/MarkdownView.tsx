import { FolderClosed, Paperclip } from 'lucide-react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { parseAnchorUrl } from '../../lib/anchors';
import { cn } from '../../lib/cn';
import { hrefFor } from '../../lib/routes';

/** Rendered Markdown for reading. Raw HTML is not rendered (react-markdown escapes it). */
export default function MarkdownView({
  source,
  font,
  className,
}: {
  source: string;
  font: 'serif' | 'sans';
  className?: string;
}) {
  return (
    <div
      className={cn('prose-entry', font === 'serif' ? 'font-serif' : 'font-sans', className)}
      style={
        font === 'serif'
          ? { fontVariationSettings: "'opsz' 16" }
          : { ['--entry-size' as string]: '1.0625rem' }
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Keep in-app addresses of linked files and folders; everything else as usual.
        urlTransform={(url) => (parseAnchorUrl(url) ? url : defaultUrlTransform(url))}
        components={{
          a: ({ node: _node, href, children, ...props }) => {
            const anchor = parseAnchorUrl(href);
            if (!anchor) {
              return (
                <a {...props} href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              );
            }
            const Icon = anchor.type === 'folder' ? FolderClosed : Paperclip;
            return (
              <Link
                to={hrefFor(anchor.type, anchor.id)}
                title={anchor.type === 'folder' ? 'Open the linked folder' : 'Open the linked file'}
                className="text-ink underline decoration-accent/60 decoration-dotted underline-offset-4 hover:decoration-accent"
              >
                {children}
                <Icon
                  className="ml-0.5 inline-block h-[0.7em] w-[0.7em] align-baseline text-accent/80"
                  aria-label={anchor.type === 'folder' ? '(folder)' : '(file)'}
                />
              </Link>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
