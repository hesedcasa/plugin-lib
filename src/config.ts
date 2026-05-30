import {Config} from '@oclif/core'
import {default as fs} from 'fs-extra'
import {default as path} from 'node:path'

export interface AuthConfig {
  apiToken: string
  email?: string
  host?: string
}

export type Profiles<T = AuthConfig> = Record<string, T>

function toMessage(error: unknown, missingMsg: string): string {
  return (error as NodeJS.ErrnoException).code === 'ENOENT' ? missingMsg : (error instanceof Error ? error.message : String(error))
}

export function createProfileManager<T = AuthConfig>(config: Config, profile?: string) {
  const cp = path.join(config.configDir, `${config.bin}-config.json`)

  async function loadAuthConfig(): Promise<T | undefined> {
    try {
      const raw = await fs.readJSON(cp)
      if (raw.profiles) {
        const resolvedProfile = profile ?? raw.defaultProfile ?? 'default'
        return raw.profiles[resolvedProfile] as T | undefined
      }

      if (profile && profile !== 'default') return undefined
      return raw.auth as T | undefined
    } catch {
      return undefined
    }
  }

  async function getDefaultProfile(): Promise<string> {
    try {
      const raw = await fs.readJSON(cp)
      return raw.defaultProfile ?? 'default'
    } catch (error) {
      throw new Error(toMessage(error, 'Missing authentication config'))
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

  async function setDefaultProfile(profileName: string): Promise<void> {
    let raw: Record<string, unknown>
    try {
      raw = await fs.readJSON(cp)
    } catch (error) {
      throw new Error(toMessage(error, 'Missing authentication config'))
    }

    const profiles = (raw.profiles ?? (raw.auth ? {default: raw.auth as AuthConfig} : undefined)) as
      | Profiles
      | undefined
    if (!profiles || !(profileName in profiles)) {
      throw new Error(`Profile '${profileName}' not found`)
    }

    raw.defaultProfile = profileName
    await fs.outputJSON(cp, raw, {spaces: 2})
  }

  async function readProfiles(): Promise<Profiles<T>> {
    try {
      const raw = await fs.readJSON(cp)
      if (raw.profiles) return raw.profiles as Profiles<T>
      // backward compat: old { auth: {...} } format
      if (raw.auth) return {default: raw.auth as T}
      return {}
    } catch (error) {
      throw new Error(toMessage(error, 'No authentication profiles found'))
    }
  }

  async function saveProfiles(profiles: Profiles<T>): Promise<void> {
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
