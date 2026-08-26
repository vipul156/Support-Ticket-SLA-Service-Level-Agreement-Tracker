// Minimal typed GraphQL client — no external dependency needed.

export interface GqlError {
  message: string
  extensions?: { code?: string; [k: string]: unknown }
}

export interface GqlResponse<T> {
  data?: T | null
  errors?: GqlError[]
}

export class ApiError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

const TOKEN_KEY = 'sla_tracker_token'

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token === null) window.localStorage.removeItem(TOKEN_KEY)
  else window.localStorage.setItem(TOKEN_KEY, token)
}

export async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token !== null) headers.Authorization = `Bearer ${token}`
  const res = await fetch('/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const body = (await res.json()) as GqlResponse<T>
  if (body.errors !== undefined && body.errors.length > 0) {
    const first = body.errors[0]
    if (first === undefined) throw new ApiError('Unknown error', 'UNKNOWN')
    throw new ApiError(first.message, first.extensions?.code ?? 'UNKNOWN')
  }
  if (body.data === null || body.data === undefined) {
    throw new ApiError('No data returned', 'NO_DATA')
  }
  return body.data
}
