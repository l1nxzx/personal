import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { parseAnchorUrl } from '../../lib/anchors';
import { cn } from '../../lib/cn';
import { hrefFor } from '../../lib/routes';
import { proseClass, proseStyle } from './writingStyle';

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
    <div className={cn(proseClass(font), className)} style={proseStyle(font)}>
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
            // Styled by `.entry-anchor` (index.css), the same as in the writing view.
            return (
              <Link
                to={hrefFor(anchor.type, anchor.id)}
                title={anchor.type === 'folder' ? 'Open the linked folder' : 'Open the linked file'}
                className={cn('entry-anchor', anchor.type === 'folder' && 'entry-anchor-folder')}
              >
                {children}
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
