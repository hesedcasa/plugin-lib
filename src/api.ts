import type {AuthConfig} from './config.js'

export interface ApiResult {
  data?: unknown
  error?: unknown
  success: boolean
}

export function buildAuthHeader(config: AuthConfig): string {
  return config.email
    ? `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`
    : `Bearer ${config.apiToken}`
}

export function createApiClient<T extends {clearClients(): void}>(
  serviceName: string,
  factory: (config: AuthConfig) => T,
) {
  let instance: null | T = null
  return {
    clearClients(): void {
      if (instance) {
        instance.clearClients()
        instance = null
      }
    },
    async getClient(config: AuthConfig): Promise<T> {
      if (instance) return instance
      try {
        instance = factory(config)
        return instance
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to initialize ${serviceName} client: ${msg}`)
      }
    },
  }
}
