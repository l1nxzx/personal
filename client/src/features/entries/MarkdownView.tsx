import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../lib/cn';

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
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
