
import { Command, Flags } from '@oclif/core'
import {action} from '@oclif/core/ux'

import {createProfileManager, testAuthConnection} from '../../../config.js'

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
      this.error(`Missing authentication config. Run '${this.config.bin} auth add'.`)
    }

    action.start('Authenticating connection')
    const res = await testAuthConnection(authConfig, this.config.pjson?.hesed?.auth)

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
