// Public marketing routes that render the standalone Kimi chrome instead of
// the workspace shell. Kept in one place so the shell, status lockup, and
// middleware agree.
export const MARKETING_PREFIXES = [
  '/welcome',
  '/how-it-works',
  '/faq',
  '/about',
];

export function isMarketingPath(pathname: string): boolean {
  return MARKETING_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
