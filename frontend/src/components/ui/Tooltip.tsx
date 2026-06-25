'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export const TooltipProvider = RadixTooltip.Provider;

interface TooltipProps {
    content?: React.ReactNode;
    children: React.ReactNode;
    side?: 'top' | 'right' | 'bottom' | 'left';
    className?: string;
}

export function Tooltip({ content, children, side = 'bottom', className }: TooltipProps) {
    if (!content) return <>{children}</>;

    return (
        <RadixTooltip.Root>
            <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
            <RadixTooltip.Portal>
                <RadixTooltip.Content
                    side={side}
                    sideOffset={6}
                    collisionPadding={8}
                    className={cn(
                        'z-[60] max-w-[16rem] select-none rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-50 shadow-md',
                        'dark:bg-slate-700',
                        className,
                    )}
                >
                    {content}
                    <RadixTooltip.Arrow className="fill-slate-900 dark:fill-slate-700" />
                </RadixTooltip.Content>
            </RadixTooltip.Portal>
        </RadixTooltip.Root>
    );
}
