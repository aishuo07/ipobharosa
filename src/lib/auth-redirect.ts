const DEFAULT_REDIRECT = "/";

/**
 * Only allow same-site absolute paths as post-login destinations. This keeps
 * callback URLs useful without turning the login page into an open redirect.
 */
export function safeRedirectPath(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return DEFAULT_REDIRECT;
  }

  return candidate;
}

export function loginPathFor(destination: string): string {
  return `/login?callbackUrl=${encodeURIComponent(safeRedirectPath(destination))}`;
}
