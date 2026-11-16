type RateLimitWindow = {
  count: number
  resetAt: number
}

const windows = new Map<string, RateLimitWindow>()

export function consumeRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now()
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = request.headers.get('x-real-ip') ?? forwardedFor ?? 'unknown'
  const key = `${bucket}:${address}`
  const current = windows.get(key)

  if (windows.size > 10_000) {
    for (const [windowKey, window] of windows) {
      if (window.resetAt <= now) windows.delete(windowKey)
    }
  }

  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    }
  }

  current.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}