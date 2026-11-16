export function apiSuccess<T>(data: T, status = 200) {
  return Response.json({ data }, { status })
}

export function apiError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status })
}