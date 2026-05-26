import {Config} from '@oclif/core'
import {default as fs} from 'fs-extra'
import {default as path} from 'node:path'

export interface AuthConfig {
  apiToken: string
  email?: string
  host: string
}

export type Profiles = Record<string, AuthConfig>

function logFsError(error: unknown, missingMsg: string, log: (message: string) => void): void {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    log(missingMsg)
  } else {
    log(error instanceof Error ? error.message : String(error))
  }
}

export function createProfileManager(config: Config, profile?: string) {
  const cp = path.join(config.configDir, `${config.bin}-config.json`)

  async function loadAuthConfig(): Promise<AuthConfig | undefined> {
    try {
      const raw = await fs.readJSON(cp)
      if (raw.profiles) {
        const resolvedProfile = profile ?? raw.defaultProfile ?? 'default'
        return raw.profiles[resolvedProfile] as AuthConfig | undefined
      }

      if (profile && profile !== 'default') return undefined
      return raw.auth as AuthConfig | undefined
    } catch {
      return undefined
    }
  }

  async function getDefaultProfile(): Promise<string> {
    try {
      const raw = await fs.readJSON(cp)
      return raw.defaultProfile ?? 'default'
    } catch {
      return 'default'
    }
  }

  async function clearDefaultProfile(): Promise<void> {
    let raw: Record<string, unknown> = {}
    try {
      raw = await fs.readJSON(cp)
    } catch {
      // file doesn't exist yet
    }

    delete raw.defaultProfile
    await fs.outputJSON(cp, raw, {spaces: 2})
  }

  async function setDefaultProfile(profileName: string, log: (message: string) => void): Promise<void> {
    let raw: Record<string, unknown>
    try {
      raw = await fs.readJSON(cp)
    } catch (error) {
      logFsError(error, 'Missing authentication config', log)
      return
    }

    const profiles = (raw.profiles ?? (raw.auth ? {default: raw.auth as AuthConfig} : undefined)) as
      | Profiles
      | undefined
    if (!profiles || !(profileName in profiles)) {
      log(`Profile '${profileName}' not found`)
      return
    }

    raw.defaultProfile = profileName
    await fs.outputJSON(cp, raw, {spaces: 2})
    log(`Default profile set to '${profileName}'`)
  }

  async function readProfiles(log: (message: string) => void): Promise<Profiles | undefined> {
    try {
      const raw = await fs.readJSON(cp)
      if (raw.profiles) return raw.profiles as Profiles
      // backward compat: old { auth: {...} } format
      if (raw.auth) return {default: raw.auth as AuthConfig}
      return {}
    } catch (error: unknown) {
      logFsError(error, 'No authentication profiles found', log)
      return undefined
    }
  }

  async function saveProfiles(profiles: Profiles): Promise<void> {
    let raw: Record<string, unknown> = {}
    try {
      raw = await fs.readJSON(cp)
    } catch {
      // file doesn't exist yet
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {auth: _auth, ...rest} = raw
    await fs.outputJSON(cp, {...rest, profiles}, {mode: 0o600})
  }

  return {clearDefaultProfile, getDefaultProfile, loadAuthConfig, readProfiles, saveProfiles, setDefaultProfile}
}
