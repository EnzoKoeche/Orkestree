// Minimal classnames joiner. Accepts strings, falsy values, and arrays.
// Avoiding the `clsx` dependency keeps the install footprint small for what
// is essentially a one-line utility.
export function cn(
    ...parts: Array<string | false | null | undefined | 0>
): string {
    return parts.filter(Boolean).join(' ');
}
