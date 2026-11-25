import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins conditional class names and resolves conflicting Tailwind utilities so
 * the last one wins.
 * @param inputs - Class names, arrays, or conditional class objects.
 * @returns One class string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
