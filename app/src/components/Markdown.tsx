import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ content }: { content: string }) {
  return (
    <div className="grid gap-2 text-sm leading-6 text-app [&_a]:text-[color:var(--app-accent)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--app-control-strong)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_ol_li]:list-decimal [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-[var(--app-control-strong)] [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul_li]:list-disc">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
