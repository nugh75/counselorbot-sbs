'use client';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TriangleAlert } from 'lucide-react';
import { DiagramBlock } from '@/components/ui/DiagramBlock';
import { splitDiagramContent } from '@/lib/diagram-content';

// Testo delle risposte nelle chat (chat guidata, Bussola, assistente), preso
// dalla chat guidata: stesso HTML per lo stesso contenuto. Gli stili stanno
// qui, non nella classe .prose globale, che solo due chat su tre usavano.
// Niente HTML grezzo: react-markdown senza rehype-raw lo mostra come testo.

function omitMarkdownNode<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
    const { node, ...elementProps } = props;
    void node;
    return elementProps;
}

const markdownComponents: Components = {
    // La tabella scorre nel suo contenitore, mai la pagina.
    table: (props) => (
        <div className="my-2 min-w-0 max-w-full overflow-x-auto" tabIndex={0}>
        <table
            className="w-full min-w-[760px] border-separate border-spacing-0 text-sm text-slate-800"
            {...omitMarkdownNode(props)}
        />
        </div>
    ),
    thead: (props) => <thead className="bg-slate-50" {...omitMarkdownNode(props)} />,
    tbody: (props) => <tbody className="[&_tr:nth-child(even)]:bg-slate-50/40" {...omitMarkdownNode(props)} />,
    tr: (props) => <tr className="border-b border-slate-100" {...omitMarkdownNode(props)} />,
    th: (props) => (
        <th
            className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 border-b border-slate-200"
            {...omitMarkdownNode(props)}
        />
    ),
    td: (props) => <td className="px-3 py-2 align-top leading-relaxed border-b border-slate-100" {...omitMarkdownNode(props)} />,
    p: (props) => <p className="my-1.5 text-sm leading-relaxed" {...omitMarkdownNode(props)} />,
    ul: (props) => <ul className="my-2 pl-5 list-disc space-y-1" {...omitMarkdownNode(props)} />,
    ol: (props) => <ol className="my-2 pl-5 list-decimal space-y-1" {...omitMarkdownNode(props)} />,
    li: (props) => <li className="leading-relaxed" {...omitMarkdownNode(props)} />,
    strong: (props) => <strong className="font-semibold text-slate-900" {...omitMarkdownNode(props)} />,
    h1: (props) => <h1 className="mb-1.5 mt-3 text-lg font-semibold text-slate-900" {...omitMarkdownNode(props)} />,
    h2: (props) => <h2 className="mb-1.5 mt-3 text-base font-semibold text-slate-900" {...omitMarkdownNode(props)} />,
    h3: (props) => <h3 className="mb-1 mt-2.5 text-sm font-semibold text-slate-900" {...omitMarkdownNode(props)} />,
    h4: (props) => <h4 className="mb-1 mt-2.5 text-sm font-semibold text-slate-900" {...omitMarkdownNode(props)} />,
    a: (props) => <a className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-800" {...omitMarkdownNode(props)} />,
    // Il codice in linea ha lo sfondo; dentro un blocco lo prende il blocco.
    code: (props) => <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em]" {...omitMarkdownNode(props)} />,
    pre: (props) => <pre className="my-2 max-w-full overflow-x-auto rounded-md bg-slate-100 p-3 text-xs [&_code]:bg-transparent [&_code]:p-0" {...omitMarkdownNode(props)} />,
    blockquote: (props) => <blockquote className="my-2 border-l-[3px] border-[var(--console-primary)] pl-3 italic text-slate-500" {...omitMarkdownNode(props)} />,
    hr: (props) => <hr className="my-3 border-slate-200" {...omitMarkdownNode(props)} />,
};

// Diagrammi, errori del provider e testo arrivano nello stesso messaggio:
// splitDiagramContent li separa e pulisce i metadati privati.
export function ChatMarkdown({ content, locale, errorMessage }: { content: string; locale: string; errorMessage: string }) {
    return splitDiagramContent(content).map((segment, index) => (
        segment.kind === 'diagram' ? (
            <DiagramBlock key={`diagram-${index}`} spec={segment.spec} locale={locale} />
        ) : segment.kind === 'provider-error' ? (
            <div
                key={`error-${index}`}
                className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
                role="alert"
            >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
            </div>
        ) : (
            <div key={`markdown-${index}`} className="min-w-0 max-w-full [overflow-wrap:anywhere]">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                >
                    {segment.content}
                </ReactMarkdown>
            </div>
        )
    ));
}
