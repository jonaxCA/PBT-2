import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatValue = (val: number, unit: string) => {
  return `${val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${unit}`;
};
