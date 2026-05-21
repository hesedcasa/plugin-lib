import {input} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {action} from '@oclif/core/ux'

import {createProfileManager, testAuthConnection} from '../../../config.js'

interface ApiResult {
  data?: unknown
  error?: unknown
  success: boolean
}

export default class AuthAdd extends Command {
  static override args = {}
  static override description = 'Add authentication'
  static override enableJsonFlag = true
  static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --p work']
  static override flags = {
    email: Flags.string({char: 'e', description: 'Account email', required: false}),
    profile: Flags.string({char: 'p', description: 'Profile name', required: false}),
    token: Flags.string({char: 't', description: 'API Token', required: !process.stdout.isTTY}),
    url: Flags.string({
      char: 'u',
      description: 'API endpoint URL (start with https://)',
      required: !process.stdout.isTTY,
    }),
  }

  public async run(): Promise<ApiResult> {
    const {flags} = await this.parse(AuthAdd)
    const profileName =
      flags.profile ?? (process.stdout.isTTY ? await input({message: 'Profile name:', required: true}) : 'default')
    const apiToken = flags.token ?? (await input({message: 'API Token:', required: true}))
    const email = flags.email ?? (await input({message: 'Account email:', required: false}))
    const host = flags.url ?? (await input({message: 'API endpoint URL (start with https://):', required: true}))

    const {readProfiles, saveProfiles} = await createProfileManager(this.config)
    const profiles = (await readProfiles(() => {})) ?? {}

    if (profileName in profiles) {
      this.error(`Profile '${profileName}' already exists. Use '${this.config.bin} auth update' to modify it.`)
    }

    profiles[profileName] = {apiToken, ...(email && {email}), host}
    await saveProfiles(profiles)

    action.start('Authenticating')
    const res = await testAuthConnection({apiToken, email, host}, this.config.pjson?.hesed?.auth)

    if (res.ok) {
      action.stop('✓ successful')
      const profileSuffix = profileName === 'default' ? '' : ` as profile '${profileName}'`
      this.log(`Authentication added${profileSuffix} successfully`)
    } else {
      action.stop('✗ failed')
      this.error('Authentication is invalid. Please check your email, token, and URL.')
    }

    return {
      data: {},
      error: {},
      success: true,
    }
  }
}
