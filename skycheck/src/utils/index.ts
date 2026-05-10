// ─────────────────────────────────────────────────────────────────
// Maxim Fare Estimator
// Formula: ₱49 base + ₱12/km after the first km. Range ±15%.
// Source: Maxim Philippines published rate card (publicly available)
// ─────────────────────────────────────────────────────────────────
export function estimateMaximFare(distanceKm: number): { min: number; max: number } {
  const base = 49;
  const perKm = 12;
  const raw = distanceKm <= 1 ? base : base + (distanceKm - 1) * perKm;
  const min = Math.ceil(raw);
  const max = Math.ceil(raw * 1.15);  // +15% surge buffer
  return { min, max };
}

export function formatFare(fare: { min: number; max: number }): string {
  return `₱${fare.min}–₱${fare.max}`;
}

// ─────────────────────────────────────────────────────────────────
// Date / Time Formatters
// ─────────────────────────────────────────────────────────────────
export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatShortDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatUpdatedAt(isoString: string): string {
  return `Updated ${new Date(isoString).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
}

export function getAlertDateGroup(isoString: string): 'TODAY' | 'YESTERDAY' | 'EARLIER THIS WEEK' {
  const now = new Date();
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 1) return 'TODAY';
  if (diffDays < 2) return 'YESTERDAY';
  return 'EARLIER THIS WEEK';
}

// ─────────────────────────────────────────────────────────────────
// Distance / Duration Formatters
// ─────────────────────────────────────────────────────────────────
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
}

// ─────────────────────────────────────────────────────────────────
// Input Validation
// ─────────────────────────────────────────────────────────────────
export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Please enter your email address.';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim()) ? null : 'Please enter a valid email address.';
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Please enter your password.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

export function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const levels = [
    { label: '', color: 'bg-gray-200' },
    { label: 'Weak', color: 'bg-red-500' },
    { label: 'Fair', color: 'bg-orange-400' },
    { label: 'Good', color: 'bg-yellow-400' },
    { label: 'Strong', color: 'bg-green-400' },
    { label: 'Very Strong', color: 'bg-green-600' },
  ];
  return { score, ...levels[score] };
}

// ─────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function clsx(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');

}
export function getApiErrorMessage(error: any, fallback?: string): string {
  const code = typeof error?.code === 'string' ? error.code : '';
  const firebaseMessages: Record<string, string> = {
    'auth/missing-email': 'Please enter your email address.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/missing-password': 'Please enter your password.',
    'auth/invalid-credential': 'Invalid email or password. Try again.',
    'auth/user-not-found': 'No account was found with that email.',
    'auth/wrong-password': 'Invalid email or password. Try again.',
    'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
    'auth/weak-password': 'Password must be at least 8 characters.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/unauthorized-domain': 'This website is not authorized for Firebase sign-in.',
    'auth/network-request-failed': 'Network error. Check your internet connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  };
  if (code && firebaseMessages[code]) return firebaseMessages[code];

  // If the error comes from an Axios/API response
  if (error?.response?.data?.error) {
    return error.response.data.error;
  }
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  
  // If it's a standard JavaScript Error object
  if (error instanceof Error) {
    return error.message;
  }
  
  // If the error is just a string
  if (typeof error === 'string') {
    return error;
  }

  // If all else fails, return the fallback message provided, 
  // or a default hardcoded string
  return fallback || 'An unexpected error occurred';
}
