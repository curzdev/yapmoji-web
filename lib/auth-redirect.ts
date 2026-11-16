export function safeRedirectPath(value: string | null | undefined, fallback = '/') {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('\r') ||
    value.includes('\n')
  ) {
    return fallback
  }

  return value
}

export function loginUrl(returnTo: string) {
  return `/login?next=${encodeURIComponent(safeRedirectPath(returnTo, '/'))}`
}