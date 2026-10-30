import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Shape tokens from globals.css: without them tailwind-merge would not know that
// `rounded-lg` replaces `rounded-card` or `min-h-0` replaces `min-h-control`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["control", "card"],
      shadow: ["card", "pop", "modal"],
      spacing: ["control"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
