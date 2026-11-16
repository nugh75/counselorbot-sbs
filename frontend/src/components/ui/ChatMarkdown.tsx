'use client';

import { memo } from 'react';
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
            className="w-full min-w-[760px] border-separate border-spacing-0 text-sm text-ink-body"
            {...omitMarkdownNode(props)}
        />
        </div>
    ),
    thead: (props) => <thead className="bg-surface-sunken" {...omitMarkdownNode(props)} />,
    tbody: (props) => <tbody className="[&_tr:nth-child(even)]:bg-surface-sunken/40" {...omitMarkdownNode(props)} />,
    tr: (props) => <tr className="border-b border-line" {...omitMarkdownNode(props)} />,
    th: (props) => (
        <th
            className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-ink-muted border-b border-line"
            {...omitMarkdownNode(props)}
        />
    ),
    td: (props) => <td className="px-3 py-2 align-top leading-relaxed border-b border-line" {...omitMarkdownNode(props)} />,
    p: (props) => <p className="my-1.5 text-sm leading-relaxed" {...omitMarkdownNode(props)} />,
    ul: (props) => <ul className="my-2 pl-5 list-disc space-y-1" {...omitMarkdownNode(props)} />,
    ol: (props) => <ol className="my-2 pl-5 list-decimal space-y-1" {...omitMarkdownNode(props)} />,
    li: (props) => <li className="leading-relaxed" {...omitMarkdownNode(props)} />,
    strong: (props) => <strong className="font-semibold text-ink" {...omitMarkdownNode(props)} />,
    h1: (props) => <h1 className="mb-1.5 mt-3 text-lg font-semibold text-ink" {...omitMarkdownNode(props)} />,
    h2: (props) => <h2 className="mb-1.5 mt-3 text-base font-semibold text-ink" {...omitMarkdownNode(props)} />,
    h3: (props) => <h3 className="mb-1 mt-2.5 text-sm font-semibold text-ink" {...omitMarkdownNode(props)} />,
    h4: (props) => <h4 className="mb-1 mt-2.5 text-sm font-semibold text-ink" {...omitMarkdownNode(props)} />,
    a: (props) => <a className="font-semibold text-link underline underline-offset-2 hover:text-ink" {...omitMarkdownNode(props)} />,
    // Il codice in linea ha lo sfondo; dentro un blocco lo prende il blocco.
    code: (props) => <code className="rounded-control bg-surface-raised px-1 py-0.5 font-mono text-[0.9em]" {...omitMarkdownNode(props)} />,
    pre: (props) => <pre className="my-2 max-w-full overflow-x-auto rounded-control bg-surface-raised p-3 text-xs [&_code]:bg-transparent [&_code]:p-0" {...omitMarkdownNode(props)} />,
    blockquote: (props) => <blockquote className="my-2 border-l-[3px] border-[var(--console-primary)] pl-3 italic text-ink-muted" {...omitMarkdownNode(props)} />,
    hr: (props) => <hr className="my-3 border-line" {...omitMarkdownNode(props)} />,
};

// Diagrammi, errori del provider e testo arrivano nello stesso messaggio:
// splitDiagramContent li separa e pulisce i metadati privati.
// Memoizzato (le proprietà sono stringhe): durante lo streaming i messaggi
// precedenti non vengono rianalizzati a ogni frammento.
export const ChatMarkdown = memo(function ChatMarkdown({ content, locale, errorMessage }: { content: string; locale: string; errorMessage: string }) {
    return splitDiagramContent(content).map((segment, index) => (
        segment.kind === 'diagram' ? (
            <DiagramBlock key={`diagram-${index}`} spec={segment.spec} locale={locale} />
        ) : segment.kind === 'provider-error' ? (
            <div
                key={`error-${index}`}
                className="flex items-start gap-2 rounded-card bg-warning-soft px-3 py-2 text-sm text-warning-ink"
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
});
