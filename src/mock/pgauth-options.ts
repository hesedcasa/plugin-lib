import {type ApiResult, type AuthCommandOptions, type FieldDef} from '../index.js'

export interface PgAuthConfig {
  database: string
  host: string
  password: string
  port: number
  ssl: boolean
  user: string
}

export const pgFields: FieldDef[] = [
  {char: 'h', description: 'Database host', name: 'host', required: true, type: 'string'},
  {char: 'd', description: 'Database name', name: 'database', required: false, type: 'string'},
  {char: 'u', description: 'Database user', name: 'user', required: true, type: 'string'},
  {char: 'w', description: 'Database password', name: 'password', required: true, type: 'string'},
  {default: 5432, description: 'Database port', name: 'port', required: true, type: 'number'},
  {default: false, description: 'Use SSL', name: 'ssl', required: true, type: 'boolean'},
]

function clearClients(): void {}

async function testConnection(_auth: PgAuthConfig): Promise<ApiResult> {
  return {success: true}
}

export const options: AuthCommandOptions<PgAuthConfig> = {
  clearClients,
  fields: pgFields,
  serviceName: 'PostgreSQL',
  testConnection,
}
