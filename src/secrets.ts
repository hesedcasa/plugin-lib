import {default as fs} from 'fs-extra'
import {default as http} from 'node:http'
import {default as https} from 'node:https'

const DEFAULT_VAULT_ADDR = 'http://127.0.0.1:8200'
const DEFAULT_VAULT_TIMEOUT_MS = 30_000

const DEFAULT_INFISICAL_SITE_URL = 'https://app.infisical.com'
const DEFAULT_INFISICAL_TIMEOUT_MS = 30_000
// Retire a cached universal-auth token slightly early so a resolution that starts
// just under the wire doesn't race the server-side expiry.
const INFISICAL_TOKEN_EXPIRY_SKEW_MS = 30_000

export interface VaultResponse {
  body: string
  statusCode: number
  statusMessage: string
}

/**
 * Thin HTTP GET wrapper over the stable `node:http`/`node:https` core modules.
 *
 * Exposed as an object method (rather than a bare function) so tests can stub
 * `vaultHttp.get` the same way the suite stubs `fs` methods — no real network.
 */
export const vaultHttp = {
  get(url: string, token: string): Promise<VaultResponse> {
    const transport = url.startsWith('https:') ? https : http
    const configured = Number(process.env.VAULT_REQUEST_TIMEOUT)
    const timeout = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_VAULT_TIMEOUT_MS
    return new Promise<VaultResponse>((resolve, reject) => {
      const request = transport.request(url, {headers: {'X-Vault-Token': token}, method: 'GET'}, (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          body += chunk
        })
        // Without this, a response stream that errors after headers (peer reset,
        // truncated body) would never fire 'end' and leave the promise pending.
        response.on('error', reject)
        response.on('end', () => {
          resolve({
            body,
            statusCode: response.statusCode ?? 0,
            statusMessage: response.statusMessage ?? '',
          })
        })
      })
      request.on('error', reject)
      // Guard against a server that accepts the connection then stalls; destroying
      // the request surfaces the timeout through the 'error' handler above.
      request.setTimeout(timeout, () => {
        request.destroy(new Error(`Vault request timed out after ${timeout}ms`))
      })
      request.end()
    })
  },
}

/**
 * Resolve a `vault:` reference against a HashiCorp Vault server.
 *
 * Reference format: `vault:<path>#<key>` — e.g. `vault:secret/data/myapp#apiToken`.
 * The `<path>` is the full API path (without the leading `/v1/`) and `<key>`
 * selects a single field from the secret. Connection details come from the
 * environment: `VAULT_ADDR` (defaults to `http://127.0.0.1:8200`) and
 * `VAULT_TOKEN` (required).
 *
 * Both KV v2 (`{ data: { data: {...} } }`) and KV v1 (`{ data: {...} }`)
 * response shapes are supported.
 */
type VaultSecretData = Record<string, unknown> | undefined

interface VaultCachedSecret {
  data: VaultSecretData
  expiresAt: number
}

const vaultSecretCache = new Map<string, VaultCachedSecret>()
const vaultSecretsInFlight = new Map<string, Promise<VaultSecretData>>()
let vaultSecretCacheGeneration = 0

/**
 * How long a fetched Vault secret may be reused, in milliseconds.
 *
 * Off by default: every resolution hits Vault unless `VAULT_CACHE_TTL`
 * (seconds) is set to a positive number. Opting in accepts that a secret
 * rotated upstream stays stale until the TTL lapses.
 */
function vaultCacheTtlMs(): number {
  const configured = Number(process.env.VAULT_CACHE_TTL)
  return Number.isFinite(configured) && configured > 0 ? configured * 1000 : 0
}

/**
 * Drop every cached Vault secret.
 *
 * Also invalidates any fetch already in flight, so a request issued before the
 * clear cannot repopulate the cache afterwards.
 */
export function clearVaultSecretCache(): void {
  vaultSecretCacheGeneration += 1
  vaultSecretCache.clear()
  vaultSecretsInFlight.clear()
}

async function fetchVaultSecretData(url: string, token: string): Promise<VaultSecretData> {
  let response: VaultResponse
  try {
    response = await vaultHttp.get(url, token)
  } catch (error) {
    throw new Error(`Failed to reach Vault at '${url}': ${error instanceof Error ? error.message : String(error)}`)
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Vault request to '${url}' failed with status ${response.statusCode} ${response.statusMessage}`)
  }

  let parsed: {data?: Record<string, unknown>}
  try {
    parsed = JSON.parse(response.body)
  } catch {
    throw new Error(`Vault returned a non-JSON response from '${url}'`)
  }

  // KV v2 nests the secret under data.data and always ships a sibling data.metadata;
  // KV v1 stores fields directly under data. Keying on `metadata` avoids misreading a
  // KV v1 secret that happens to have a field literally named `data`.
  const outer = parsed.data
  const isKvV2 =
    outer !== undefined &&
    'metadata' in outer &&
    typeof outer.data === 'object' &&
    outer.data !== null &&
    !Array.isArray(outer.data)
  return (isKvV2 ? outer.data : outer) as VaultSecretData
}

/**
 * Fetch the secret at `url`, sharing the request across callers.
 *
 * A Vault response carries the whole secret and the key is picked client-side,
 * so several `vault:` fields pointing at one path are all served by a single
 * round trip instead of one each.
 */
async function loadVaultSecretData(url: string, token: string): Promise<VaultSecretData> {
  const ttl = vaultCacheTtlMs()
  const cached = vaultSecretCache.get(url)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const inFlight = vaultSecretsInFlight.get(url)
  if (inFlight) return inFlight

  const generation = vaultSecretCacheGeneration
  const fetching = fetchVaultSecretData(url, token)
    .then((data) => {
      // A clear during the round trip must not be undone by a request that
      // started before it.
      if (ttl > 0 && generation === vaultSecretCacheGeneration) {
        vaultSecretCache.set(url, {data, expiresAt: Date.now() + ttl})
      }

      return data
    })
    .finally(() => {
      if (vaultSecretsInFlight.get(url) === fetching) vaultSecretsInFlight.delete(url)
    })

  vaultSecretsInFlight.set(url, fetching)
  return fetching
}

export async function resolveVaultSecret(reference: string): Promise<string> {
  const [path, key] = reference.split('#')
  if (!path || !key) {
    throw new Error(
      `Invalid Vault reference '${reference}'. Expected format 'vault:<path>#<key>' (e.g. 'vault:secret/data/app#apiToken')`,
    )
  }

  const token = process.env.VAULT_TOKEN
  if (!token) {
    throw new Error('Environment variable VAULT_TOKEN is not set')
  }

  const addr = (process.env.VAULT_ADDR ?? DEFAULT_VAULT_ADDR).replace(/\/+$/, '')
  const url = `${addr}/v1/${path.replace(/^\/+/, '')}`

  const secretData = await loadVaultSecretData(url, token)
  const value = secretData?.[key]

  if (value === undefined) {
    throw new Error(`Key '${key}' not found in Vault secret at '${path}'`)
  }

  return String(value)
}

export interface InfisicalResponse {
  body: string
  statusCode: number
  statusMessage: string
}

function infisicalRequest(
  url: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  payload?: string,
): Promise<InfisicalResponse> {
  const transport = url.startsWith('https:') ? https : http
  const configured = Number(process.env.INFISICAL_REQUEST_TIMEOUT)
  const timeout = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_INFISICAL_TIMEOUT_MS
  return new Promise<InfisicalResponse>((resolve, reject) => {
    const request = transport.request(url, {headers, method}, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => {
        body += chunk
      })
      // Without this, a response stream that errors after headers (peer reset,
      // truncated body) would never fire 'end' and leave the promise pending.
      response.on('error', reject)
      response.on('end', () => {
        resolve({
          body,
          statusCode: response.statusCode ?? 0,
          statusMessage: response.statusMessage ?? '',
        })
      })
    })
    request.on('error', reject)
    // Guard against a server that accepts the connection then stalls; destroying
    // the request surfaces the timeout through the 'error' handler above.
    request.setTimeout(timeout, () => {
      request.destroy(new Error(`Infisical request timed out after ${timeout}ms`))
    })
    if (payload !== undefined) request.write(payload)
    request.end()
  })
}

/**
 * Thin HTTP wrapper over the stable `node:http`/`node:https` core modules,
 * speaking the same REST endpoints the official Infisical Node SDK uses
 * (`POST /api/v1/auth/universal-auth/login`, `GET /api/v3/secrets/raw/<name>`).
 *
 * Exposed as an object (rather than bare functions) so tests can stub
 * `infisicalHttp.get`/`infisicalHttp.post` the same way the suite stubs `fs` —
 * no real network.
 */
export const infisicalHttp = {
  get(url: string, token: string): Promise<InfisicalResponse> {
    return infisicalRequest(url, 'GET', {accept: 'application/json', authorization: `Bearer ${token}`})
  },
  post(url: string, payload: Record<string, unknown>): Promise<InfisicalResponse> {
    const body = JSON.stringify(payload)
    return infisicalRequest(
      url,
      'POST',
      {
        accept: 'application/json',
        'content-length': String(Buffer.byteLength(body)),
        'content-type': 'application/json',
      },
      body,
    )
  },
}

interface InfisicalToken {
  expiresAt: number
  token: string
}

const infisicalTokenCache = new Map<string, InfisicalToken>()
const infisicalLoginsInFlight = new Map<string, Promise<string>>()
// Bumped on every clear. A login captures the generation it started in and
// declines to populate the cache if that generation has since been retired.
let infisicalCacheGeneration = 0

/**
 * Drop any cached universal-auth access token.
 *
 * `resolveSecrets` resolves every field of a config concurrently, so the login
 * result is memoized to avoid one round trip per `infisical:` field. Consumers
 * that swap credentials mid-process (and tests) call this to force a re-login.
 *
 * Clearing also invalidates any login already in flight, so a request issued
 * with the previous credentials cannot write its token back afterwards.
 */
export function clearInfisicalAuthCache(): void {
  infisicalCacheGeneration += 1
  infisicalTokenCache.clear()
  infisicalLoginsInFlight.clear()
  // Values fetched under the outgoing credentials should not outlive them.
  clearInfisicalSecretCache()
}

interface InfisicalCachedSecret {
  expiresAt: number
  value: string
}

const infisicalSecretCache = new Map<string, InfisicalCachedSecret>()
const infisicalSecretsInFlight = new Map<string, Promise<string>>()
let infisicalSecretCacheGeneration = 0

/**
 * How long a resolved secret value may be reused, in milliseconds.
 *
 * Off by default: `resolveInfisicalSecret` always hits the API unless
 * `INFISICAL_CACHE_TTL` (seconds) is set to a positive number. Callers that opt
 * in accept that a secret rotated upstream stays stale until the TTL lapses,
 * which is why this is not on for everyone.
 */
function infisicalCacheTtlMs(): number {
  const configured = Number(process.env.INFISICAL_CACHE_TTL)
  return Number.isFinite(configured) && configured > 0 ? configured * 1000 : 0
}

/**
 * Drop every cached secret value.
 *
 * Also invalidates any fetch already in flight, so a request issued before the
 * clear cannot repopulate the cache afterwards. `clearInfisicalAuthCache()`
 * calls this too — rotating credentials discards cached values as well.
 */
export function clearInfisicalSecretCache(): void {
  infisicalSecretCacheGeneration += 1
  infisicalSecretCache.clear()
  infisicalSecretsInFlight.clear()
}

async function sendInfisical(send: () => Promise<InfisicalResponse>, url: string): Promise<InfisicalResponse> {
  let response: InfisicalResponse
  try {
    response = await send()
  } catch (error) {
    throw new Error(`Failed to reach Infisical at '${url}': ${error instanceof Error ? error.message : String(error)}`)
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Infisical request to '${url}' failed with status ${response.statusCode} ${response.statusMessage}`)
  }

  return response
}

function parseInfisicalBody<T>(response: InfisicalResponse, url: string): T {
  try {
    return JSON.parse(response.body) as T
  } catch {
    throw new Error(`Infisical returned a non-JSON response from '${url}'`)
  }
}

async function infisicalUniversalAuthLogin(
  siteUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<InfisicalToken> {
  const url = `${siteUrl}/api/v1/auth/universal-auth/login`
  const response = await sendInfisical(() => infisicalHttp.post(url, {clientId, clientSecret}), url)
  const parsed = parseInfisicalBody<{accessToken?: unknown; expiresIn?: unknown}>(response, url)

  if (typeof parsed.accessToken !== 'string' || parsed.accessToken.length === 0) {
    throw new Error(`Infisical universal auth login at '${url}' did not return an access token`)
  }

  // expiresIn is in seconds. When the API omits it the entry expires immediately,
  // which costs an extra login rather than risking a stale token.
  const expiresIn = typeof parsed.expiresIn === 'number' && Number.isFinite(parsed.expiresIn) ? parsed.expiresIn : 0
  return {
    expiresAt: Date.now() + Math.max(0, expiresIn * 1000 - INFISICAL_TOKEN_EXPIRY_SKEW_MS),
    token: parsed.accessToken,
  }
}

async function resolveInfisicalToken(siteUrl: string): Promise<string> {
  // An explicit access token wins: it needs no login round trip and no caching.
  const explicit = process.env.INFISICAL_TOKEN
  if (explicit) return explicit

  const clientId = process.env.INFISICAL_CLIENT_ID
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'Infisical credentials are not set. Provide INFISICAL_TOKEN, or INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET for universal auth',
    )
  }

  const cacheKey = `${siteUrl}|${clientId}`
  const cached = infisicalTokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.token

  // Concurrent resolutions share a single login instead of stampeding the API.
  const inFlight = infisicalLoginsInFlight.get(cacheKey)
  if (inFlight) return inFlight

  const generation = infisicalCacheGeneration
  const login = infisicalUniversalAuthLogin(siteUrl, clientId, clientSecret)
    .then((result) => {
      // A clear during the round trip means the caller rotated credentials;
      // caching now would resurrect the state they explicitly dropped. The
      // in-flight callers still get this token — it is what their own request
      // returned — but nothing after them inherits it.
      if (generation === infisicalCacheGeneration) infisicalTokenCache.set(cacheKey, result)
      return result.token
    })
    .finally(() => {
      // Retract only our own entry: a clear may already have replaced it with a
      // fresher login that must not be evicted here.
      if (infisicalLoginsInFlight.get(cacheKey) === login) infisicalLoginsInFlight.delete(cacheKey)
    })

  infisicalLoginsInFlight.set(cacheKey, login)
  return login
}

/**
 * Refuse to put Infisical credentials on an unencrypted wire.
 *
 * The default site URL is HTTPS, so this only bites when an operator has
 * explicitly pointed `INFISICAL_SITE_URL` at an `http://` endpoint. Loopback
 * stays allowed — a sidecar or `kubectl port-forward` has no network path for
 * an intermediary to sit on — and `INFISICAL_ALLOW_INSECURE_HTTP=true` is the
 * escape hatch for a deployment that terminates TLS at a trusted proxy.
 */
function assertInfisicalTransportIsSafe(siteUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(siteUrl)
  } catch {
    throw new Error(`Invalid Infisical site URL '${siteUrl}'`)
  }

  if (parsed.protocol !== 'http:') return

  // URL keeps IPv6 hosts in bracketed form; strip them before comparing.
  const hostname = parsed.hostname.replaceAll(/^\[|]$/g, '')
  const isLoopback = hostname === 'localhost' || hostname === '::1' || /^127\./.test(hostname)
  if (isLoopback || process.env.INFISICAL_ALLOW_INSECURE_HTTP === 'true') return

  throw new Error(
    `Refusing to send Infisical credentials over plaintext HTTP to '${siteUrl}'. Use https://, target a loopback address, or set INFISICAL_ALLOW_INSECURE_HTTP=true to override`,
  )
}

interface InfisicalReference {
  environment: string
  projectId: string
  secretName: string
  secretPath: string
}

function parseInfisicalReference(reference: string): InfisicalReference {
  const separator = reference.indexOf('#')
  // Secret names may themselves contain '#', so split on the first one only.
  const locator = separator === -1 ? '' : reference.slice(0, separator)
  const secretName = separator === -1 ? '' : reference.slice(separator + 1)
  const segments = locator.split('/').filter((segment) => segment.length > 0)

  // A lone segment is ambiguous — projectId without an environment, or the other
  // way round — so require either both or neither (falling back to the env vars).
  if (!secretName || segments.length === 1) {
    throw new Error(
      `Invalid Infisical reference '${reference}'. Expected format 'infisical:<projectId>/<environment>[/<secretPath>]#<secretName>' (e.g. 'infisical:proj-123/prod#API_TOKEN')`,
    )
  }

  const inline = segments.length >= 2

  const projectId = inline ? segments[0] : process.env.INFISICAL_PROJECT_ID
  if (!projectId) {
    throw new Error(
      `Infisical reference '${reference}' omits the project ID and environment variable INFISICAL_PROJECT_ID is not set`,
    )
  }

  const environment = inline ? segments[1] : process.env.INFISICAL_ENVIRONMENT
  if (!environment) {
    throw new Error(
      `Infisical reference '${reference}' omits the environment and environment variable INFISICAL_ENVIRONMENT is not set`,
    )
  }

  const secretPath =
    segments.length > 2 ? `/${segments.slice(2).join('/')}` : (process.env.INFISICAL_SECRET_PATH ?? '/')

  return {environment, projectId, secretName, secretPath}
}

/**
 * Resolve an `infisical:` reference against an Infisical instance.
 *
 * Reference format: `infisical:<projectId>/<environment>[/<secretPath>]#<secretName>`
 * — e.g. `infisical:proj-123/prod#API_TOKEN` or
 * `infisical:proj-123/prod/database#PASSWORD` (secret path `/database`). The
 * project ID and environment may be omitted entirely
 * (`infisical:#API_TOKEN`), in which case `INFISICAL_PROJECT_ID` and
 * `INFISICAL_ENVIRONMENT` supply them and `INFISICAL_SECRET_PATH` supplies the
 * folder (default `/`).
 *
 * Authentication mirrors the official Node SDK: either a ready-made
 * `INFISICAL_TOKEN`, or universal auth via `INFISICAL_CLIENT_ID` and
 * `INFISICAL_CLIENT_SECRET`. `INFISICAL_SITE_URL` points at a self-hosted
 * instance (defaults to `https://app.infisical.com`).
 *
 * A plaintext `http://` site URL is refused unless it targets a loopback
 * address or `INFISICAL_ALLOW_INSECURE_HTTP=true` is set — see
 * `assertInfisicalTransportIsSafe`.
 */
async function fetchInfisicalSecret(siteUrl: string, target: InfisicalReference): Promise<string> {
  const {environment, projectId, secretName, secretPath} = target
  const token = await resolveInfisicalToken(siteUrl)

  const query = new URLSearchParams({
    environment,
    expandSecretReferences: 'true',
    secretPath,
    viewSecretValue: 'true',
    workspaceId: projectId,
  })
  const url = `${siteUrl}/api/v3/secrets/raw/${encodeURIComponent(secretName)}?${query.toString()}`

  const response = await sendInfisical(() => infisicalHttp.get(url, token), url)
  const parsed = parseInfisicalBody<{secret?: {secretValue?: unknown}}>(response, url)
  const value = parsed.secret?.secretValue

  if (value === undefined || value === null) {
    throw new Error(
      `Secret '${secretName}' not found in Infisical project '${projectId}' (environment '${environment}', path '${secretPath}')`,
    )
  }

  return String(value)
}

export async function resolveInfisicalSecret(reference: string): Promise<string> {
  const target = parseInfisicalReference(reference)

  const siteUrl = (process.env.INFISICAL_SITE_URL ?? DEFAULT_INFISICAL_SITE_URL).replace(/\/+$/, '')
  // Checked before the login so credentials are never put on the wire.
  assertInfisicalTransportIsSafe(siteUrl)

  const cacheKey = [siteUrl, target.projectId, target.environment, target.secretPath, target.secretName].join('|')

  const ttl = infisicalCacheTtlMs()
  const cached = infisicalSecretCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  // `resolveSecrets` fans out over every field at once, so two fields holding the
  // same reference would otherwise each open their own request.
  const inFlight = infisicalSecretsInFlight.get(cacheKey)
  if (inFlight) return inFlight

  const generation = infisicalSecretCacheGeneration
  const fetching = fetchInfisicalSecret(siteUrl, target)
    .then((value) => {
      // Same guard as the auth cache: a clear during the round trip must not be
      // undone by a request that started before it.
      if (ttl > 0 && generation === infisicalSecretCacheGeneration) {
        infisicalSecretCache.set(cacheKey, {expiresAt: Date.now() + ttl, value})
      }

      return value
    })
    .finally(() => {
      if (infisicalSecretsInFlight.get(cacheKey) === fetching) infisicalSecretsInFlight.delete(cacheKey)
    })

  infisicalSecretsInFlight.set(cacheKey, fetching)
  return fetching
}

export async function resolveSecretValue(value: string): Promise<string> {
  if (value.startsWith('env:')) {
    const varName = value.slice(4)
    const resolved = process.env[varName]
    if (resolved === undefined) throw new Error(`Environment variable '${varName}' is not set`)
    return resolved
  }

  if (value.startsWith('file:')) {
    const filePath = value.slice(5)
    try {
      return (await fs.readFile(filePath, 'utf8')).trim()
    } catch (error) {
      throw new Error(
        `Failed to read secret from file '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (value.startsWith('vault:')) {
    return resolveVaultSecret(value.slice(6))
  }

  if (value.startsWith('infisical:')) {
    return resolveInfisicalSecret(value.slice(10))
  }

  return value
}

export async function resolveSecrets<T>(config: T): Promise<T> {
  if (!config || typeof config !== 'object') return config
  const entries = Object.entries(config as Record<string, unknown>)
  const resolved = await Promise.all(
    entries.map(async ([key, value]) => [key, typeof value === 'string' ? await resolveSecretValue(value) : value]),
  )
  return Object.fromEntries(resolved) as T
}
