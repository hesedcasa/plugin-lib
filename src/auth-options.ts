import {type ApiResult, type AuthCommandOptions, type AuthConfig} from './index.js'

function clearClients(): void {}

async function testConnection(_auth: AuthConfig): Promise<ApiResult> {
  return {success: true}
}

export const options: AuthCommandOptions<AuthConfig> = {
  clearClients,
  serviceName: 'MyService',
  testConnection,
}
