import {default as fs} from 'fs-extra'
import {default as http} from 'node:http'
import {default as https} from 'node:https'

const DEFAULT_VAULT_ADDR = 'http://127.0.0.1:8200'
const DEFAULT_VAULT_TIMEOUT_MS = 30_000

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
  const secretData = (isKvV2 ? outer.data : outer) as Record<string, unknown> | undefined
  const value = secretData?.[key]

  if (value === undefined) {
    throw new Error(`Key '${key}' not found in Vault secret at '${path}'`)
  }

  return String(value)
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
