const STORAGE_KEY = "arr_hub_auth_token"

let inMemoryToken: string | null = null

export function getAuthToken(): string | null {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(STORAGE_KEY)
    return token ?? inMemoryToken
  }
  return inMemoryToken
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token
  if (typeof window !== "undefined") {
    if (token) {
      window.localStorage.setItem(STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }
}

export function hasAuthToken(): boolean {
  return getAuthToken() !== null
}
