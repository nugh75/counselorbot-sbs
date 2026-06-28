// Mark del brand: bussola — il counseling ORIENTA. Ago nord in ocra (la direzione,
// il momento), coda sud in petrol; quadrante petrol con tacche cardinali (registro
// "strumento"). Condiviso tra Header (piccolo) e IntroScreen (grande).
export function CompassMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
            <circle cx="16" cy="16" r="12.5" stroke="#155e63" strokeWidth="1.3" opacity="0.4" />
            <g stroke="#155e63" strokeWidth="1.3" opacity="0.4" strokeLinecap="round">
                <line x1="16" y1="3.5" x2="16" y2="6" />
                <line x1="28.5" y1="16" x2="26" y2="16" />
                <line x1="16" y1="28.5" x2="16" y2="26" />
                <line x1="3.5" y1="16" x2="6" y2="16" />
            </g>
            {/* ago: nord ocra, sud petrol */}
            <polygon points="16,5.5 20,16 12,16" fill="#c9711f" />
            <polygon points="16,26.5 20,16 12,16" fill="#155e63" />
            <circle cx="16" cy="16" r="1.7" fill="#0e3539" />
        </svg>
    );
}
