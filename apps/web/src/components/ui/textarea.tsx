import * as React from "react"

import { cn } from "@/lib/utils"

// Textarea — matches Input.tsx in tone (text-base for iOS anti-zoom on
// focus, h-* surface rhythm replaced by min-h since textarea is multi-line).
// border-input + ring-ring on focus mirrors every other field in the app.

export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                ref={ref}
                className={cn(
                    "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                )}
                {...props}
            />
        )
    },
)
Textarea.displayName = "Textarea"

export { Textarea }
