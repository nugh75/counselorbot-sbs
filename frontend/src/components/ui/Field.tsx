'use client';
import { cloneElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { fieldWiring } from '@/lib/field-wiring';
import { cn } from '@/lib/utils';

// Form fields on the tokens: one border, one radius, 44px, the global focus ring
// with no outline override. Invalid state comes from `aria-invalid`, set by Field.
const CONTROL = 'block w-full min-w-0 min-h-control rounded-control border border-line-strong bg-surface px-3 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger';

type ControlProps = { 'aria-describedby'?: string; 'aria-invalid'?: boolean; id?: string };

interface FieldProps {
    label: ReactNode;
    help?: ReactNode;
    error?: ReactNode;
    className?: string;
    children: ReactElement<ControlProps>;
}

/** Label + control + optional help and error, wired by id and `aria-describedby`. */
export function Field({ label, help, error, className, children }: FieldProps) {
    const generated = useId();
    const id = children.props.id ?? generated;
    const { helpId, errorId, describedBy, invalid } = fieldWiring(id, { help: Boolean(help), error: Boolean(error) });
    const ownDescribedBy = children.props['aria-describedby'];
    return (
        <div className={cn('min-w-0 space-y-1', className)}>
            <label htmlFor={id} className="block text-sm font-semibold text-ink-body">{label}</label>
            {cloneElement(children, { id, 'aria-describedby': [describedBy, ownDescribedBy].filter(Boolean).join(' ') || undefined, 'aria-invalid': invalid ?? children.props['aria-invalid'] })}
            {help && <p id={helpId} className="text-xs text-ink-muted">{help}</p>}
            {error && <p id={errorId} className="text-xs text-danger">{error}</p>}
        </div>
    );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
    return <input className={cn(CONTROL, 'py-2', className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
    return <select className={cn(CONTROL, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea className={cn(CONTROL, 'py-2', className)} {...rest} />;
}
