'use client';

import { motion, useReducedMotion } from 'framer-motion';

// Mark del brand: bussola — il counseling ORIENTA. Ago nord-est in ocra (non il
// nord dato: la direzione propria), coda sud-ovest in petrol; quadrante petrol con
// tacche cardinali (registro "strumento"). Condiviso tra Header (piccolo, statico)
// e IntroScreen (grande, `animated`: l'ago si assesta con una molla al mount e
// devia al passaggio del mouse, come disturbato da un campo magnetico).
export function CompassMark({ className, animated = false }: { className?: string; animated?: boolean }) {
    const reduceMotion = useReducedMotion();
    const spin = animated && !reduceMotion;

    const needle = (
        <>
            <polygon points="16,5.5 20,16 12,16" fill="#c9711f" />
            <polygon points="16,26.5 20,16 12,16" fill="#155e63" />
        </>
    );

    const dial = (
        <>
            <circle cx="16" cy="16" r="12.5" stroke="#155e63" strokeWidth="1.3" opacity="0.4" />
            <g stroke="#155e63" strokeWidth="1.3" opacity="0.4" strokeLinecap="round">
                <line x1="16" y1="3.5" x2="16" y2="6" />
                <line x1="28.5" y1="16" x2="26" y2="16" />
                <line x1="16" y1="28.5" x2="16" y2="26" />
                <line x1="3.5" y1="16" x2="6" y2="16" />
            </g>
        </>
    );

    if (!spin) {
        return (
            <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
                {dial}
                <g transform="rotate(45 16 16)">{needle}</g>
                <circle cx="16" cy="16" r="1.7" fill="#0e3539" />
            </svg>
        );
    }

    return (
        <motion.svg
            viewBox="0 0 32 32"
            fill="none"
            className={className}
            aria-hidden="true"
            initial="settle"
            animate="settle"
            whileHover="deviate"
        >
            {dial}
            <motion.g
                variants={{ settle: { rotate: 45 }, deviate: { rotate: -20 } }}
                initial={{ rotate: -60 }}
                transition={{ type: 'spring', stiffness: 28, damping: 5, mass: 1.2 }}
                style={{ transformOrigin: '16px 16px', transformBox: 'view-box' }}
            >
                {needle}
            </motion.g>
            <circle cx="16" cy="16" r="1.7" fill="#0e3539" />
        </motion.svg>
    );
}
