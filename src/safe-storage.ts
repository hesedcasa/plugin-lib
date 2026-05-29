import crypto from 'node:crypto'
import os from 'node:os'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

type KeytarModule = {
  getPassword(service: string, account: string): Promise<null | string>
  setPassword(service: string, account: string, password: string): Promise<void>
}

async function tryLoadKeytar(): Promise<KeytarModule | null> {
  try {
    // keytar is an optional peer dependency — absent in environments without native bindings.
    // The type-only shim in keytar.d.ts satisfies TypeScript; at runtime we catch any import error.
    const mod = await import('keytar' as string)
    return (mod.default ?? mod) as KeytarModule
  } catch {
    return null
  }
}

function deriveMachineKey(service: string): Buffer {
  // Fallback when keytar is unavailable: deterministic key from machine identity.
  // Weaker than OS keychain — prefer installing keytar for production use.
  const seed = `${service}:${os.hostname()}:${os.userInfo().username}`
  return crypto.createHash('sha256').update(seed).digest()
}

/**
 * Creates a safeStorage instance that mirrors Electron's safeStorage API.
 *
 * Encryption keys are stored in the OS keychain via keytar (optional peer dep).
 * When keytar is unavailable the module falls back to a machine-derived key.
 */
export function createSafeStorage(service: string, account = 'encryption-key') {
  let _keytar: KeytarModule | null | undefined // undefined = not yet resolved

  async function resolveKeytar(): Promise<KeytarModule | null> {
    if (_keytar === undefined) _keytar = await tryLoadKeytar()
    return _keytar
  }

  async function getOrCreateKey(): Promise<Buffer> {
    const kt = await resolveKeytar()
    if (!kt) return deriveMachineKey(service)

    let keyHex = await kt.getPassword(service, account)
    if (!keyHex) {
      keyHex = crypto.randomBytes(KEY_LENGTH).toString('hex')
      await kt.setPassword(service, account, keyHex)
    }

    return Buffer.from(keyHex, 'hex')
  }

  /** Returns true when the OS keychain is accessible via keytar. */
  async function isEncryptionAvailable(): Promise<boolean> {
    return (await resolveKeytar()) !== null
  }

  /**
   * Encrypts `plainText` and returns the ciphertext as a Buffer.
   * The returned buffer must be kept as-is and passed to {@link decryptString}.
   */
  async function encryptString(plainText: string): Promise<Buffer> {
    const key = await getOrCreateKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    // Layout: [ IV (12) | authTag (16) | ciphertext ]
    return Buffer.concat([iv, authTag, encrypted])
  }

  /**
   * Decrypts a Buffer previously returned by {@link encryptString}.
   * Throws if the buffer is tampered with or was encrypted with a different key.
   */
  async function decryptString(encrypted: Buffer): Promise<string> {
    if (encrypted.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted buffer: too short')
    }

    const key = await getOrCreateKey()
    const iv = encrypted.subarray(0, IV_LENGTH)
    const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
  }

  return {decryptString, encryptString, isEncryptionAvailable}
}
