export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_USERNAME_LENGTH = 30;
export const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;
export const DEBOUNCE_MS = 300;
export const SUCCESS_GREEN = '#34C759';
export const ERROR_RED = '#FF3B30';

export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', check: (p: string) => p.length >= 8 },
  { key: 'uppercase', label: 'Contains uppercase letter', check: (p: string) => /[A-Z]/.test(p) },
  { key: 'lowercase', label: 'Contains lowercase letter', check: (p: string) => /[a-z]/.test(p) },
  { key: 'number', label: 'Contains number', check: (p: string) => /[0-9]/.test(p) },
  {
    key: 'special',
    label: 'Contains special character',
    check: (p: string) => /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'`~]/.test(p),
  },
] as const;
