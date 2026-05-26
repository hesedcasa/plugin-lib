import {confirm, input} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {action} from '@oclif/core/ux'
import {default as fs} from 'fs-extra'
import {default as path} from 'node:path'

import {type ApiResult} from './api.js'
import {createProfileManager, type Profiles} from './config.js'

export interface AuthCommandOptions {
  clearClients: () => void
  hasHostFlag: boolean
  serviceName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testConnection: (auth: any) => Promise<ApiResult>
}

export function createAuthAddCommand(options: AuthCommandOptions): typeof Command {
  const {clearClients, hasHostFlag, serviceName, testConnection} = options

  return class AuthAdd extends Command {
    static override args = {}
    static override description = `Add ${serviceName} authentication`
    static override enableJsonFlag = true
    static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --profile work',
    ]
    static override flags = {
      email: Flags.string({char: 'e', description: 'Account email', required: false}),
      profile: Flags.string({char: 'p', description: 'Profile name', required: false}),
      token: Flags.string({char: 't', description: 'API Token', required: !process.stdout.isTTY}),
      url: Flags.string({
        char: 'u',
        description: `${serviceName} instance URL (start with https://)`,
        hidden: !hasHostFlag,
        required: hasHostFlag && !process.stdout.isTTY,
      }),
    }

    public async run(): Promise<ApiResult> {
      const {flags} = await this.parse(AuthAdd)
      const profileName =
        flags.profile ?? (process.stdout.isTTY ? await input({message: 'Profile name:', required: true}) : 'default')
      const apiToken = flags.token ?? (await input({message: 'API Token:', required: true}))
      const email = flags.email ?? (await input({message: 'Account email:', required: false}))
      const host = hasHostFlag
        ? (flags.url ?? (await input({message: `${serviceName} instance URL (start with https://):`, required: true})))
        : undefined
      const configFilePath = path.join(this.config.configDir, `${this.config.bin}-config.json`)

      let existing: Record<string, unknown> = {}
      try {
        existing = await fs.readJSON(configFilePath)
      } catch {
        // file doesn't exist yet
      }

      const profiles = (existing.profiles ?? (existing.auth ? {default: existing.auth} : {})) as Record<string, unknown>

      if (profileName in profiles) {
        this.error(`Profile '${profileName}' already exists. Use '${this.config.bin} auth update' to modify it.`)
      }

      profiles[profileName] = {apiToken, ...(email && {email}), ...(host && {host})}
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const {auth: _auth, ...rest} = existing
      await fs.outputJSON(configFilePath, {...rest, profiles}, {mode: 0o600})

      action.start('Authenticating')
      const result = await testConnection({apiToken, ...(email && {email}), ...(host && {host})})
      clearClients()

      if (result.success) {
        action.stop('✓ successful')
        const profileSuffix = profileName === 'default' ? '' : ` as profile '${profileName}'`
        this.log(`Authentication added${profileSuffix} successfully`)
      } else {
        action.stop('✗ failed')
        this.error('Authentication is invalid. Please check your credentials.')
      }

      return result
    }
  }
}

export function createAuthListCommand(options: Pick<AuthCommandOptions, 'hasHostFlag'>): typeof Command {
  const {hasHostFlag} = options

  interface ProfileInfo {
    apiToken: string
    default?: boolean
    email?: string
    host?: string
    name: string
  }

  interface ListResult {
    profiles: ProfileInfo[]
  }

  return class AuthList extends Command {
    static override args = {}
    static override description = 'List authentication profiles'
    static override enableJsonFlag = true
    static override examples = ['<%= config.bin %> <%= command.id %>']
    static override flags = {}

    public async run(): Promise<ListResult> {
      await this.parse(AuthList)
      const {getDefaultProfile, readProfiles} = createProfileManager(this.config)
      const profiles: Profiles | undefined = await readProfiles(this.log.bind(this))

      if (!profiles || Object.keys(profiles).length === 0) {
        this.log('No authentication profiles found. Run auth:add to add one.')
        return {profiles: []}
      }

      const defaultProfile = await getDefaultProfile()
      const profileList: ProfileInfo[] = Object.entries(profiles).map(([name, auth]) => ({
        ...(auth.email && {email: auth.email}),
        ...(hasHostFlag && auth.host && {host: auth.host}),
        ...(name === defaultProfile && {default: true}),
        apiToken: `${auth.apiToken.slice(0, 3)}...${auth.apiToken.slice(-4)}`,
        name,
      }))

      for (const profile of profileList) {
        const details = [
          ...(hasHostFlag && profile.host ? [`  host: ${profile.host}`] : []),
          `  token: ${profile.apiToken}`,
          profile.email ? `  email: ${profile.email}` : '',
        ]
          .filter(Boolean)
          .join('\n')
        this.log(`${profile.name}${profile.default ? ' (default):' : ':'}
${details}`)
      }

      return {profiles: profileList}
    }
  }
}

export function createAuthProfileCommand(): typeof Command {
  return class AuthProfile extends Command {
    static override args = {}
    static override description = 'Set or show the default authentication profile'
    static override enableJsonFlag = true
    static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --default work',
    ]
    static override flags = {
      default: Flags.string({description: 'Profile name to set as default', required: false}),
    }

    public async run(): Promise<void> {
      const {flags} = await this.parse(AuthProfile)
      const {getDefaultProfile, setDefaultProfile} = createProfileManager(this.config)

      if (flags.default) {
        await setDefaultProfile(flags.default, this.log.bind(this))
        return
      }

      const current = await getDefaultProfile()
      this.log(current)
    }
  }
}

export function createAuthTestCommand(options: AuthCommandOptions): typeof Command {
  const {clearClients, serviceName, testConnection} = options

  return class AuthTest extends Command {
    static override args = {}
    static override description = 'Test authentication and connection'
    static override enableJsonFlag = true
    static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --profile work',
    ]
    static override flags = {
      profile: Flags.string({char: 'p', description: 'Authentication profile name', required: false}),
    }

    public async run(): Promise<ApiResult> {
      const {flags} = await this.parse(AuthTest)
      const authConfig = await createProfileManager(this.config, flags.profile).loadAuthConfig()
      if (!authConfig) {
        this.error(`Missing authentication config. Run '${this.config.bin} auth add'.`)
      }

      action.start('Authenticating connection')
      const result = await testConnection(authConfig)
      clearClients()

      if (result.success) {
        action.stop('✓ successful')
        this.log(`Successful connection to ${serviceName}`)
      } else {
        action.stop('✗ failed')
        this.error(`Failed to connect to ${serviceName}.`)
      }

      return result
    }
  }
}

export function createAuthDeleteCommand(): typeof Command {
  return class AuthDelete extends Command {
    static override args = {}
    static override description = 'Delete an authentication profile'
    static override enableJsonFlag = true
    static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --profile work',
    ]
    static override flags = {
      profile: Flags.string({char: 'p', description: 'Profile name to delete', required: false}),
    }

    public async run(): Promise<void> {
      const {flags} = await this.parse(AuthDelete)
      const {clearDefaultProfile, getDefaultProfile, readProfiles, saveProfiles, setDefaultProfile} =
        createProfileManager(this.config)

      const profiles = await readProfiles(this.log.bind(this))
      if (!profiles || Object.keys(profiles).length === 0) {
        this.error('No authentication profiles found.')
      }

      const profileName =
        flags.profile ??
        (process.stdout.isTTY ? await input({message: 'Profile name to delete:', required: true}) : 'default')

      if (!(profileName in profiles)) {
        this.error(`Profile '${profileName}' does not exist.`)
      }

      if (process.stdout.isTTY) {
        const answer = await confirm({message: `Delete profile '${profileName}'?`})
        if (!answer) return
      }

      const defaultProfile = await getDefaultProfile()
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const {[profileName]: _, ...remaining} = profiles

      await saveProfiles(remaining)

      // If deleted profile was the default, clear or update default
      if (profileName === defaultProfile) {
        const remainingKeys = Object.keys(remaining)
        await (remainingKeys.length > 0
          ? setDefaultProfile(remainingKeys[0], this.log.bind(this))
          : clearDefaultProfile())
      }

      this.log(`Profile '${profileName}' deleted.`)
    }
  }
}

export function createAuthUpdateCommand(options: AuthCommandOptions): typeof Command {
  const {clearClients, hasHostFlag, serviceName, testConnection} = options

  return class AuthUpdate extends Command {
    static override args = {}
    static override description = 'Update existing authentication profile'
    static override enableJsonFlag = true
    static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --profile work',
    ]
    static override flags = {
      email: Flags.string({char: 'e', description: 'Account email', required: false}),
      profile: Flags.string({char: 'p', description: 'Profile name to update (default: "default")', required: false}),
      token: Flags.string({char: 't', description: 'API Token', required: !process.stdout.isTTY}),
      url: Flags.string({
        char: 'u',
        description: `${serviceName} instance URL (start with https://)`,
        hidden: !hasHostFlag,
        required: hasHostFlag && !process.stdout.isTTY,
      }),
    }

    // eslint-disable-next-line complexity
    public async run(): Promise<ApiResult | void> {
      const {flags} = await this.parse(AuthUpdate)
      const profileName = flags.profile ?? 'default'
      const configFilePath = path.join(this.config.configDir, `${this.config.bin}-config.json`)

      let existing: Record<string, unknown>
      try {
        existing = await fs.readJSON(configFilePath)
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        if (msg.toLowerCase().includes('no such file or directory')) {
          this.log('Run auth:add instead')
        } else {
          this.log(msg)
        }

        return
      }

      const legacyAuth = existing.auth as Record<string, string> | undefined
      const profiles = (existing.profiles ?? (legacyAuth ? {default: legacyAuth} : {})) as Record<
        string,
        Record<string, string>
      >
      if (!profiles[profileName]) {
        this.error(`Profile '${profileName}' does not exist. Use '${this.config.bin} auth add' to create it.`)
      }

      const current = profiles[profileName] ?? {}

      const apiToken =
        flags.token ?? (await input({default: current.apiToken, message: 'API Token:', prefill: 'tab', required: true}))
      const email =
        flags.email ??
        (await input({default: current.email, message: 'Account email:', prefill: 'tab', required: false}))
      const host = hasHostFlag
        ? (flags.url ??
          (await input({
            default: current.host,
            message: `${serviceName} instance URL (start with https://):`,
            prefill: 'tab',
            required: true,
          })))
        : undefined

      if (process.stdout.isTTY) {
        const answer = await confirm({message: 'Override existing config?'})
        if (!answer) return
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const {auth: _, ...rest} = existing
      const updatedConfig = {
        ...rest,
        profiles: {
          ...profiles,
          [profileName]: {apiToken, ...(email && {email}), ...(host && {host})},
        },
      }
      await fs.outputJSON(configFilePath, updatedConfig, {mode: 0o600})

      action.start('Authenticating')
      const result = await testConnection({apiToken, ...(email && {email}), ...(host && {host})})
      clearClients()

      if (result.success) {
        action.stop('✓ successful')
        const profileSuffix = profileName === 'default' ? '' : ` for profile '${profileName}'`
        this.log(`Authentication${profileSuffix} updated successfully`)
      } else {
        action.stop('✗ failed')
        this.error('Authentication is invalid. Please check your credentials.')
      }

      return result
    }
  }
}
