import {default as fs} from 'fs-extra'

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
