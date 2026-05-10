export function authTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7)
  }

  const apiKeyHeader = request.headers.get("x-api-key")
  if (apiKeyHeader && apiKeyHeader.trim().length > 0) {
    return apiKeyHeader.trim()
  }

  const apiKey = new URL(request.url).searchParams.get("apikey")
  return apiKey && apiKey.trim().length > 0 ? apiKey.trim() : null
}
