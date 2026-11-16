export function hasSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false

  let requestUrl: URL
  try {
    requestUrl = new URL(request.url)
  } catch {
    return false
  }

  const allowedOrigins = new Set([requestUrl.origin])
  const host = request.headers.get('host')
  if (!host) return false

  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim()
  const protocol =
    forwardedProtocol === 'http' || forwardedProtocol === 'https'
      ? `${forwardedProtocol}:`
      : requestUrl.protocol
  try {
    allowedOrigins.add(new URL(`${protocol}//${host}`).origin)
  } catch {
    return false
  }

  return allowedOrigins.has(origin)
}
