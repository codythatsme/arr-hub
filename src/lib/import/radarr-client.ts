import { RadarrMovieListSchema, RootFolderListSchema, SystemStatusSchema } from "./schemas"

const TIMEOUT_MS = 30_000

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

function buildUrl(baseUrl: string, path: string, apiKey: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "")
  const url = new URL(`${trimmed}${path}`)
  url.searchParams.set("apikey", apiKey)
  return url.toString()
}

export async function testConnection(baseUrl: string, apiKey: string) {
  const raw = await fetchJson(buildUrl(baseUrl, "/api/v3/system/status", apiKey))
  return SystemStatusSchema.parse(raw)
}

export async function fetchMovies(baseUrl: string, apiKey: string) {
  const raw = await fetchJson(buildUrl(baseUrl, "/api/v3/movie", apiKey))
  return RadarrMovieListSchema.parse(raw)
}

export async function fetchRootFolders(baseUrl: string, apiKey: string) {
  const raw = await fetchJson(buildUrl(baseUrl, "/api/v3/rootfolder", apiKey))
  return RootFolderListSchema.parse(raw)
}
