export function canUseNetlifyIdentity() {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'https:';
}
