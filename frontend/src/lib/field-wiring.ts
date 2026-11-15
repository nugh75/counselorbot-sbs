// Ids that tie a form control to its help and error text (components/ui/Field).
// The error comes first in `aria-describedby`: it is what a screen reader must say first.
export function fieldWiring(id: string, { help, error }: { help?: boolean; error?: boolean }) {
    const helpId = help ? `${id}-help` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;
    return { helpId, errorId, describedBy, invalid: error ? true : undefined };
}
