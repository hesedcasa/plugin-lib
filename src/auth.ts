import {confirm, input} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {action} from '@oclif/core/ux'

import {type ApiResult} from './api.js'
import {createProfileManager, type Profiles} from './config.js'

export interface FieldDef {
  char: string
  default?: boolean | number | string
  description: string
  masked?: boolean
  message: string
  name: string
  type?: 'boolean' | 'number' | 'string'
}

export interface AuthCommandOptions {
  clearClients: () => void
  fields?: FieldDef[] // when provided, overrides legacy apiToken/email/host behavior
  hasHostFlag: boolean
  serviceName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testConnection: (auth: any) => Promise<ApiResult>
}

function buildDynamicFlags(fields: FieldDef[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const f of fields) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const char = f.char as any
    if (f.type === 'number') {
      result[f.name] = Flags.integer({
        char,
        description: f.description,
        ...(f.default === undefined ? {} : {default: f.default as number}),
      })
    } else if (f.type === 'boolean') {
      result[f.name] = Flags.boolean({
        char,
        description: f.description,
        ...(f.default === undefined ? {} : {default: f.default as boolean}),
      })
    } else {
      result[f.name] = Flags.string({
        char,
        description: f.description,
        ...(f.default === undefined ? {} : {default: String(f.default)}),
      })
    }
  }

  return result
}

async function promptFieldValue(
  f: FieldDef,
  currentValue?: boolean | number | string,
): Promise<boolean | number | string> {
  if (f.type === 'boolean') {
    return confirm({
      default: currentValue === undefined ? (f.default as boolean | undefined) : Boolean(currentValue),
      message: f.message,
    })
  }

  const inputDefaults =
    currentValue === undefined
      ? f.default === undefined
        ? {}
        : {default: String(f.default)}
      : {default: String(currentValue), prefill: 'tab' as const}
  const raw = await input({...inputDefaults, message: f.message})
  return f.type === 'number' ? Number(raw) : raw
}

export function createAuthAddCommand(options: AuthCommandOptions): typeof Command {
  const {clearClients, fields, hasHostFlag, serviceName, testConnection} = options

  if (fields) {
    return class extends Command {
      static override description = `Add ${serviceName} auth profile`
      static override flags = {
        profile: Flags.string({char: 'p', default: 'default', description: 'Profile name'}),
        ...buildDynamicFlags(fields!),
      }

      async run(): Promise<void> {
        const {flags} = await this.parse(this.constructor as typeof Command)
        const profileName = flags.profile ?? 'default'
        const pm = createProfileManager(this.config, profileName)
        const existingProfiles = (await pm.readProfiles(this.log.bind(this))) ?? {}

        if (profileName in existingProfiles) {
          this.error(`Profile '${profileName}' already exists. Use '${this.config.bin} auth update' to modify it.`)
        }

        const auth: Record<string, boolean | number | string> = {}
        for (const f of fields) {
          // eslint-disable-next-line no-await-in-loop
          auth[f.name] = (flags[f.name] as boolean | number | string | undefined) ?? (await promptFieldValue(f))
        }

        await pm.saveProfiles({
          ...existingProfiles,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [profileName]: auth as any,
        })

        action.start('Authenticating')
        const result = await testConnection(auth)
        clearClients()

        if (result.success) {
          action.stop('✓ successful')
          const profileSuffix = profileName === 'default' ? '' : ` as profile '${profileName}'`
          this.log(`Profile "${profileName}" saved${profileSuffix}.`)
        } else {
          action.stop('✗ failed')
          this.error('Authentication is invalid. Please check your credentials.')
        }
      }
    }
  }

  // Legacy behavior (for Jira-style apiToken/email/host)
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

      const pm = createProfileManager(this.config, profileName)
      const profiles = (await pm.readProfiles(this.log.bind(this))) ?? {}

      if (profileName in profiles) {
        this.error(`Profile '${profileName}' already exists. Use '${this.config.bin} auth update' to modify it.`)
      }

      await pm.saveProfiles({
        ...profiles,
        [profileName]: {apiToken, ...(email && {email}), ...(host && {host})},
      })

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

export function createAuthListCommand(options: Pick<AuthCommandOptions, 'fields' | 'hasHostFlag'>): typeof Command {
  const {fields, hasHostFlag} = options

  interface ProfileInfo {
    [key: string]: unknown
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

      if (fields) {
        // Dynamic fields display
        const profileList: ProfileInfo[] = Object.entries(profiles).map(([name, auth]) => {
          const entry: ProfileInfo = {
            ...(name === defaultProfile && {default: true}),
            apiToken: '',
            name,
          }
          for (const f of fields) {
            const val = (auth as unknown as Record<string, string>)[f.name]
            if (val !== undefined) {
              entry[f.name] = f.masked ? `${String(val).slice(0, 3)}...${String(val).slice(-4)}` : val
            }
          }

          return entry
        })

        for (const profile of profileList) {
          const details = fields
            .map((f) => (profile[f.name] === undefined ? '' : `  ${f.name}: ${profile[f.name]}`))
            .filter(Boolean)
            .join('\n')
          this.log(`${profile.name}${profile.default ? ' (default):' : ':'}\n${details}`)
        }

        return {profiles: profileList}
      }

      // Legacy display
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
        this.log(`${profile.name}${profile.default ? ' (default):' : ':'}\n${details}`)
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
  const {clearClients, fields, hasHostFlag, serviceName, testConnection} = options

  if (fields) {

    return class extends Command {
      static override description = `Update ${serviceName} auth profile`
      static override flags = {
        profile: Flags.string({
          char: 'p',
          default: 'default',
          description: 'Profile name to update (default: "default")',
        }),
        ...buildDynamicFlags(fields!),
      }

      async run(): Promise<ApiResult | void> {
        const {flags} = await this.parse(this.constructor as typeof Command)
        const profileName = flags.profile ?? 'default'
        const pm = createProfileManager(this.config, profileName)
        const existing = ((await pm.loadAuthConfig()) ?? {}) as Record<string, boolean | number | string>

        const auth: Record<string, boolean | number | string> = {}
        for (const f of fields) {
          auth[f.name] =
            // eslint-disable-next-line no-await-in-loop
            (flags[f.name] as boolean | number | string | undefined) ?? (await promptFieldValue(f, existing[f.name]))
        }

        if (process.stdout.isTTY) {
          const answer = await confirm({message: 'Override existing config?'})
          if (!answer) return
        }

        const allProfiles = (await pm.readProfiles(this.log.bind(this))) ?? {}
        await pm.saveProfiles({
          ...allProfiles,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [profileName]: auth as any,
        })

        action.start('Authenticating')
        const result = await testConnection(auth)

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

  // Legacy behavior (unchanged, for Jira)
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

    public async run(): Promise<ApiResult | void> {
      const {flags} = await this.parse(AuthUpdate)
      const profileName = flags.profile ?? 'default'
      const pm = createProfileManager(this.config, profileName)
      const profiles = await pm.readProfiles(this.log.bind(this))

      if (!profiles) {
        this.log('Run auth:add instead')
        return
      }

      if (!profiles[profileName]) {
        this.error(`Profile '${profileName}' does not exist. Use '${this.config.bin} auth add' to create it.`)
      }

      const current = profiles[profileName] as unknown as Record<string, string>

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

      await pm.saveProfiles({
        ...profiles,
        [profileName]: {apiToken, ...(email && {email}), ...(host && {host})},
      })

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
