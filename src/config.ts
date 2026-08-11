import {type Config} from '@oclif/core'
import fs from 'fs-extra'
import path from 'node:path'

import {resolveSecrets} from './secrets.js'

export type AuthConfig = {
  apiToken: string
  email?: string
  host?: string
}

export type Profiles<T = AuthConfig> = Record<string, T>

type LegacyConfig = {
  auth?: AuthConfig
}

type ModernConfig<T = AuthConfig> = {
  defaultProfile?: string
  profiles: Profiles<T>
}

type ConfigFile<T = AuthConfig> = LegacyConfig | ModernConfig<T>

function toMessage(error: unknown, missingMsg: string): string {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
    ? missingMsg
    : error instanceof Error
      ? error.message
      : String(error)
}

export function createProfileManager<T = AuthConfig>(config: Config, profile?: string, configFile?: string) {
  const cp = configFile
    ? path.join(config.configDir, configFile)
    : path.join(config.configDir, `${config.bin}-config.json`)

  async function loadAuthConfig(): Promise<T | undefined> {
    try {
      const raw = (await fs.readJSON(cp)) as ConfigFile<T>
      let data: T | undefined
      if ('profiles' in raw && raw.profiles) {
        const resolvedProfile = profile ?? raw.defaultProfile ?? 'default'
        data = raw.profiles[resolvedProfile]
      } else if ('auth' in raw) {
        if (profile && profile !== 'default') return undefined
        data = raw.auth as T | undefined
      }

      return data === undefined ? undefined : await resolveSecrets(data)
    } catch {
      return undefined
    }
  }

  async function getDefaultProfile(): Promise<string> {
    try {
      const raw = (await fs.readJSON(cp)) as ConfigFile<T>
      return 'defaultProfile' in raw ? (raw.defaultProfile ?? 'default') : 'default'
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
      Profiles | undefined
    if (!profiles || !(profileName in profiles)) {
      throw new Error(`Profile '${profileName}' not found`)
    }

    raw.defaultProfile = profileName
    await fs.outputJSON(cp, raw, {spaces: 2})
  }

  async function readProfiles(): Promise<Profiles<T>> {
    try {
      const raw = (await fs.readJSON(cp)) as ConfigFile<T>
      if ('profiles' in raw && raw.profiles) return raw.profiles
      // backward compat: old { auth: {...} } format
      if ('auth' in raw && raw.auth) return {default: raw.auth as T}
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
