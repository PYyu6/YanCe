/**
 * Color utility functions for the hold detector and UI.
 */

/** Common climbing route colors with human-readable names. */
export const ROUTE_COLORS: { name: string; hex: string }[] = [
  { name: 'Red', hex: '#e53e3e' },
  { name: 'Blue', hex: '#3182ce' },
  { name: 'Green', hex: '#38a169' },
  { name: 'Yellow', hex: '#ecc94b' },
  { name: 'Orange', hex: '#ed8936' },
  { name: 'Purple', hex: '#805ad5' },
  { name: 'Pink', hex: '#ed64a6' },
  { name: 'White', hex: '#e2e8f0' },
  { name: 'Black', hex: '#2d3748' },
  { name: 'Teal', hex: '#319795' },
];

/** Get a contrasting text color (black or white) for a given background. */
export function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Relative luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? '#000000' : '#ffffff';
}

/** Difficulty → color mapping for reach overlays. */
export const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#22c55e',
  moderate: '#eab308',
  limit: '#f97316',
  dynamic: '#ef4444',
  unreachable: '#6b7280',
};

/** Difficulty → human label. */
export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy Reach',
  moderate: 'Moderate',
  limit: 'At Limit',
  dynamic: 'Dynamic Required',
  unreachable: 'Out of Range',
};
