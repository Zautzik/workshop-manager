/**
 * @fileoverview Utility Functions - Class Name Merging
 * 
 * SYSTEM ROLE: CSS Class Utility Helper
 * 
 * Exports the `cn()` function that:
 * - Merges multiple CSS class name arguments intelligently
 * - Uses clsx to handle conditional classes
 * - Uses tailwind-merge to resolve conflicting Tailwind classes
 * - Prevents duplicate or conflicting utility classes
 * 
 * Example: cn('px-2', condition && 'px-4') intelligently chooses the right padding
 * 
 * Used throughout components to dynamically apply styles.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
