import {Command, Flags} from '@oclif/core'
import {action} from '@oclif/core/ux'

import {createProfileManager} from '../../config.js'

interface ApiResult {
  data?: unknown
  error?: unknown
  success: boolean
}

export default class AuthTest extends Command {
  static override args = {}
  static override description = 'Test authentication and connection'
  static override enableJsonFlag = true
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --p work']
  static override flags = {
    profile: Flags.string({char: 'p', description: 'Authentication profile name', required: false}),
  }

  public async run(): Promise<ApiResult> {
    const {flags} = await this.parse(AuthTest)

    const {authConfig} = await createProfileManager(this.config, flags.profile)
    if (!authConfig) {
      return {
        error: 'Missing authentication config',
        success: false,
      }
    }

    const {apiToken, email, host} = authConfig

    action.start('Authenticating connection')
    const authHeader = email ? `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}` : `Bearer ${apiToken}`
    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- fetch is available in Node 18+
    const res = await fetch(host + (this.config.pjson?.hesed?.auth?.testPath ?? '/ping'), {
      headers: {Authorization: authHeader},
      method: this.config.pjson?.hesed?.auth?.method ?? 'GET',
    })

    console.log(res)
    
    if (res.ok) {
      action.stop('✓ successful')
      this.log('Successful connection')
    } else {
      action.stop('✗ failed')
      this.error('Failed to connect.')
    }

    return {data: {}, success: true}
  }
}
