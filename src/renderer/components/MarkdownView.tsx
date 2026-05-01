// Rendered-markdown view used by the Read modes of Backlog and State.
// Wraps react-markdown with project styling so headings, lists, code
// blocks, and task-list checkboxes look right in our dark palette.
//
// Kept narrow on purpose: we don't render arbitrary HTML, link
// targets are not auto-opened, and there's no remark-rehype custom
// pipeline. If a markdown feature stops rendering correctly, the
// fix is usually adding a new component override below.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownView({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <div className="grid h-full place-items-center text-sm text-zinc-500">
        (empty)
      </div>
    );
  }

  return (
    <div className="prose-caffeine flex-1 overflow-y-auto p-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-2 mb-4 text-xl font-semibold text-zinc-100">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-6 mb-3 text-base font-semibold text-zinc-200">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-5 mb-2 text-sm font-semibold text-zinc-300">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-4 mb-2 text-sm font-medium text-zinc-300">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-3 text-sm leading-6 text-zinc-300">{children}</p>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 underline-offset-2 hover:underline"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-zinc-100">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="text-zinc-200">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="my-3 ml-5 list-disc space-y-1 text-sm text-zinc-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 ml-5 list-decimal space-y-1 text-sm text-zinc-300">
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => {
            // GFM task list items render with a className "task-list-item".
            // We override the marker via Tailwind's list-none + a custom
            // checkbox glyph aligned with the text.
            const isTask = (props as { className?: string }).className
              ?.includes("task-list-item");
            if (isTask) {
              return (
                <li className="-ml-5 flex list-none items-start gap-2 text-sm text-zinc-300">
                  {children}
                </li>
              );
            }
            return <li className="marker:text-zinc-600">{children}</li>;
          },
          input: ({ checked, type }) => {
            if (type !== "checkbox") return null;
            return (
              <input
                type="checkbox"
                checked={!!checked}
                readOnly
                className="mt-1 accent-emerald-500"
              />
            );
          },
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className={`${className} block`}>{children}</code>
              );
            }
            return (
              <code className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-[12px] text-emerald-300">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-[12px] leading-5 text-zinc-300">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-zinc-700 pl-3 text-sm text-zinc-400">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-zinc-800" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="text-xs text-zinc-300">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-zinc-800 px-2 py-1 text-left font-semibold text-zinc-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-zinc-800 px-2 py-1">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
