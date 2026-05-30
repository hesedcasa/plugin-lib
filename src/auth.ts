import {confirm, input} from '@inquirer/prompts'
import {Command, Flags} from '@oclif/core'
import {action} from '@oclif/core/ux'

import {type ApiResult} from './api.js'
import {type AuthConfig, createProfileManager, type Profiles} from './config.js'

export interface FieldDef {
  char?:
    | 'a'
    | 'b'
    | 'c'
    | 'd'
    | 'e'
    | 'f'
    | 'g'
    | 'h'
    | 'i'
    | 'j'
    | 'k'
    | 'l'
    | 'm'
    | 'n'
    | 'o'
    | 'p'
    | 'q'
    | 'r'
    | 's'
    | 't'
    | 'u'
    | 'v'
    | 'w'
    | 'x'
    | 'y'
    | 'z' // shorter flag version
  default?: boolean | number | string // default value if flag not passed
  description: string
  name: string
  required?: boolean // if false, empty string values are omitted from the auth payload
  type: 'boolean' | 'number' | 'string'
}

export interface AuthCommandOptions<T = AuthConfig> {
  clearClients: () => void
  fields?: FieldDef[]
  serviceName: string
  testConnection: (auth: T) => Promise<ApiResult>
}

function buildDynamicFlags(fields: FieldDef[]) {
  return Object.fromEntries(
    fields.map(({char, description, name, type}) => {
      const base = {char, description, required: !process.stdout.isTTY}
      if (type === 'number') return [name, Flags.integer(base)]
      if (type === 'boolean') return [name, Flags.boolean(base)]
      return [name, Flags.string(base)]
    }),
  )
}

function getLegacyDefaultFields(serviceName: string): FieldDef[] {
  return [
    {char: 't', description: 'API Token', name: 'apiToken', required: true, type: 'string'},
    {char: 'e', description: 'Account email', name: 'email', type: 'string'},
    {char: 'u', description: `${serviceName} instance URL`, name: 'host', required: true, type: 'string'},
  ]
}

async function promptFieldValue(
  f: FieldDef,
  errorFn: (msg: string) => never,
  currentValue?: boolean | number | string,
): Promise<boolean | never | number | string> {
  const {default: def, description, type} = f

  try {
    if (type === 'boolean') {
      return confirm({
        default: currentValue === undefined ? (def as boolean) : Boolean(currentValue),
        message: description + ':',
      })
    }

    const raw = await input({
      default: currentValue === undefined ? (def === undefined ? undefined : String(def)) : String(currentValue),
      message: description + ':',
      required: true,
    })

    return type === 'number' ? Number(raw) : raw
  } catch {
    errorFn('Operation canceled!')
  }
}

async function collectAuthFields(
  errorFn: (msg: string) => never,
  fields: FieldDef[],
  flags: Record<string, unknown>,
  existing?: Record<string, boolean | number | string>,
): Promise<Record<string, boolean | number | string>> {
  const auth: Record<string, boolean | number | string> = {}

  async function collect(index: number): Promise<void> {
    if (index >= fields.length) return
    const f = fields[index]
    const value =
      (flags[f.name] as boolean | number | string | undefined) ??
      (await promptFieldValue(f, errorFn, existing?.[f.name]))

    if (f.required !== false || value !== '') {
      auth[f.name] = value
    }

    await collect(index + 1)
  }

  await collect(0)
  return auth
}

function profileSuffix(name: string, prep: 'as' | 'for'): string {
  return name === 'default' ? '' : ` ${prep} '${name}'`
}

async function testAndReport<T>(
  auth: T,
  testFn: (auth: T) => Promise<ApiResult>,
  clearFn: () => void,
  errorFn: (msg: string) => never,
): Promise<ApiResult> {
  action.start('Authenticating')
  const result = await testFn(auth)
  clearFn()
  if (result.success) {
    action.stop('✓ successful')
  } else {
    action.stop('✗ failed')
    errorFn('Authentication is invalid. Please check your credentials.')
  }

  return result
}

abstract class AuthCommandBase extends Command {
  override toErrorJson(err: Error & Record<string, unknown>) {
    return {error: err.message}
  }
}

export function createAuthAddCommand<T = AuthConfig>(options: AuthCommandOptions<T>): typeof Command {
  const {clearClients, fields, serviceName, testConnection} = options
  const resolvedFields = fields ?? getLegacyDefaultFields(serviceName)

  return class AuthAdd extends AuthCommandBase {
    static override args = {}
    static override description = `Add ${serviceName} authentication`
    static override enableJsonFlag = true
    static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -p prod']
    static override flags = {
      profile: Flags.string({char: 'p', description: 'Profile name', required: !process.stdout.isTTY}),
      ...buildDynamicFlags(resolvedFields),
    }

    public async run(): Promise<ApiResult> {
      const {flags} = await this.parse(this.constructor as typeof Command)

      const profileName = flags.profile ?? (await input({default: 'default', message: 'Profile name:', required: true}))
      const pm = createProfileManager<T>(this.config, profileName)

      let existingProfiles: Profiles<T>
      try {
        existingProfiles = await pm.readProfiles()
      } catch {
        existingProfiles = {} as Profiles<T>
      }

      if (profileName in existingProfiles) {
        this.error(`Profile '${profileName}' already exists. Use '${this.config.bin} auth update' to modify it.`)
      }

      const auth = await collectAuthFields((msg) => this.error(msg), resolvedFields, flags)

      await pm.saveProfiles({
        ...existingProfiles,
        [profileName]: auth as unknown as T,
      })

      const result = await testAndReport(auth as T, testConnection, clearClients, (msg) => this.error(msg))
      this.log(`Authentication added${profileSuffix(profileName, 'as')} successfully`)
      return result
    }
  }
}

export function createAuthListCommand(): typeof Command {
  interface ProfileInfo {
    [key: string]: unknown
    default?: boolean
    name: string
  }

  return class AuthList extends AuthCommandBase {
    static override args = {}
    static override description = 'List authentication profiles'
    static override enableJsonFlag = true
    static override examples = ['<%= config.bin %> <%= command.id %>']
    static override flags = {}

    public async run(): Promise<ApiResult> {
      await this.parse(AuthList)
      const {getDefaultProfile, readProfiles} = createProfileManager(this.config)
      let profiles: Profiles | undefined
      let defaultProfile = 'default'
      try {
        const resolved = await Promise.all([readProfiles(), getDefaultProfile()])
        profiles = resolved[0]
        defaultProfile = resolved[1]
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error))
      }

      if (!profiles || Object.keys(profiles).length === 0) {
        this.error('No authentication profiles found.')
      }

      const profileList: ProfileInfo[] = Object.entries(profiles).map(([name, auth]) => ({
        ...(name === defaultProfile && {default: true}),
        name,
        ...Object.fromEntries(
          Object.entries(auth as unknown as Record<string, unknown>).filter(([, v]) => v !== undefined),
        ),
      }))

      for (const profile of profileList) {
        const details = Object.entries(profile)
          .filter(([key]) => key !== 'name' && key !== 'default')
          .map(([key, val]) => `  ${key}: ${val}`)
          .join('\n')
        this.log(`${profile.name}${profile.default ? ' (default):' : ':'}\n${details}`)
      }

      return {
        data: profileList,
        success: true,
      }
    }
  }
}

export function createAuthProfileCommand(): typeof Command {
  return class AuthProfile extends AuthCommandBase {
    static override args = {}
    static override description = 'Set or show the default authentication profile'
    static override enableJsonFlag = true
    static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --default test',
    ]
    static override flags = {
      default: Flags.string({description: 'Profile to set as default', required: false}),
    }

    public async run(): Promise<ApiResult> {
      const {flags} = await this.parse(AuthProfile)
      const {getDefaultProfile, setDefaultProfile} = createProfileManager(this.config)
      let profile = ''

      if (flags.default) {
        try {
          await setDefaultProfile(flags.default)
          this.log(`Default profile set to '${flags.default}'`)
        } catch (error) {
          this.error(error instanceof Error ? error.message : String(error))
        }

        return {success: true}
      }

      try {
        profile = await getDefaultProfile()
        this.log(profile)
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error))
      }

      return {
        data: profile,
        success: true,
      }
    }
  }
}

export function createAuthTestCommand<T = AuthConfig>(options: AuthCommandOptions<T>): typeof Command {
  const {clearClients, serviceName, testConnection} = options

  return class AuthTest extends AuthCommandBase {
    static override args = {}
    static override description = 'Test authentication and connection'
    static override enableJsonFlag = true
    static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -p prod']
    static override flags = {
      profile: Flags.string({char: 'p', description: 'Authentication profile name', required: false}),
    }

    public async run(): Promise<ApiResult> {
      const {flags} = await this.parse(AuthTest)
      const authConfig = await createProfileManager<T>(this.config, flags.profile).loadAuthConfig()
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
  return class AuthDelete extends AuthCommandBase {
    static override args = {}
    static override description = 'Delete an authentication profile'
    static override enableJsonFlag = true
    static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -p prod']
    static override flags = {
      profile: Flags.string({char: 'p', description: 'Profile to delete', required: false}),
    }

    public async run(): Promise<ApiResult> {
      const {flags} = await this.parse(AuthDelete)
      const {clearDefaultProfile, getDefaultProfile, readProfiles, saveProfiles, setDefaultProfile} =
        createProfileManager(this.config)

      const profiles = await readProfiles().catch((error: unknown) => {
        this.error(error instanceof Error ? error.message : String(error))
      })

      if (Object.keys(profiles).length === 0) {
        this.error('No authentication profiles found.')
      }

      const profileName =
        flags.profile ??
        (process.stdout.isTTY ? await input({message: 'Profile to delete:', required: true}) : 'default')

      if (!(profileName in profiles)) {
        this.error(`Profile '${profileName}' does not exist.`)
      }

      if (process.stdout.isTTY) {
        const answer = await confirm({message: `Delete profile '${profileName}'?`})
        if (!answer) return {success: false}
      }

      const defaultProfile = await getDefaultProfile().catch(() => 'default')
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const {[profileName]: _, ...remaining} = profiles

      await saveProfiles(remaining)

      // If deleted profile was the default, clear or update default
      if (profileName === defaultProfile) {
        const remainingKeys = Object.keys(remaining)
        await (remainingKeys.length > 0 ? setDefaultProfile(remainingKeys[0]) : clearDefaultProfile())
      }

      this.log(`Profile '${profileName}' deleted.`)

      return {success: true}
    }
  }
}

export function createAuthUpdateCommand<T = AuthConfig>(options: AuthCommandOptions<T>): typeof Command {
  const {clearClients, fields, serviceName, testConnection} = options
  const resolvedFields = fields ?? getLegacyDefaultFields(serviceName)

  return class AuthUpdate extends AuthCommandBase {
    static override args = {}
    static override description = `Update ${serviceName} authentication`
    static override enableJsonFlag = true
    static override examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> -p test']
    static override flags = {
      profile: Flags.string({char: 'p', description: 'Profile name', required: !process.stdout.isTTY}),
      ...buildDynamicFlags(resolvedFields),
    }

    public async run(): Promise<ApiResult | void> {
      const {flags} = await this.parse(this.constructor as typeof Command)

      const profileName = flags.profile ?? (await input({default: 'default', message: 'Profile name:', required: true}))
      const pm = createProfileManager<T>(this.config, profileName)
      const allProfiles = await pm.readProfiles().catch(() => null)

      if (!allProfiles) return

      if (!allProfiles[profileName]) {
        this.error(`Profile '${profileName}' does not exist. Use '${this.config.bin} auth add' to create it.`)
      }

      const existing = allProfiles[profileName] as unknown as Record<string, boolean | number | string>

      const auth = await collectAuthFields((msg) => this.error(msg), resolvedFields, flags, existing)

      if (process.stdout.isTTY) {
        const answer = await confirm({message: 'Override existing config?'})
        if (!answer) return
      }

      await pm.saveProfiles({
        ...allProfiles,
        [profileName]: auth as unknown as T,
      })

      const result = await testAndReport(auth as unknown as T, testConnection, clearClients, (msg) => this.error(msg))
      this.log(`Authentication${profileSuffix(profileName, 'for')} updated successfully`)
      return result
    }
  }
}
