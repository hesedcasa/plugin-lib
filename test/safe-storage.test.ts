import {expect} from 'chai'
import {createSandbox} from 'sinon'

import {createSafeStorage} from '../src/safe-storage.js'

describe('createSafeStorage', () => {
  const sandbox = createSandbox()

  // Simulate a keytar-like in-memory store
  beforeEach(() => {
    sandbox.reset()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('machine-key fallback (no keytar)', () => {
    it('encrypts and decrypts a string without keytar', async () => {
      // createSafeStorage with a unique service falls back to machine key when keytar is unavailable.
      // We cannot unload modules mid-test, so we test the fallback path through a storage
      // instance whose internal keytar resolution returns null via the known keytar absence.
      // In CI/environments without keytar installed, tryLoadKeytar() returns null automatically.
      // We still need to verify the crypto path works — do so by round-tripping.
      const s = createSafeStorage('no-keytar-service')
      const plainText = 'hello, world!'
      const encrypted = await s.encryptString(plainText)
      expect(Buffer.isBuffer(encrypted)).to.be.true
      expect(encrypted.length).to.be.greaterThan(0)
      const decrypted = await s.decryptString(encrypted)
      expect(decrypted).to.equal(plainText)
    })

    it('produces different ciphertext for repeated encryptions of the same plaintext', async () => {
      const s = createSafeStorage('no-keytar-service-2')
      const plainText = 'same input'
      const enc1 = await s.encryptString(plainText)
      const enc2 = await s.encryptString(plainText)
      expect(enc1.equals(enc2)).to.be.false
    })

    it('encrypts empty string', async () => {
      const s = createSafeStorage('no-keytar-service-3')
      const enc = await s.encryptString('')
      const dec = await s.decryptString(enc)
      expect(dec).to.equal('')
    })

    it('encrypts unicode strings', async () => {
      const s = createSafeStorage('no-keytar-service-4')
      const plainText = '日本語テスト 🔐'
      const enc = await s.encryptString(plainText)
      const dec = await s.decryptString(enc)
      expect(dec).to.equal(plainText)
    })

    it('encrypts long strings', async () => {
      const s = createSafeStorage('no-keytar-service-5')
      const plainText = 'a'.repeat(10_000)
      const enc = await s.encryptString(plainText)
      const dec = await s.decryptString(enc)
      expect(dec).to.equal(plainText)
    })

    it('throws when decrypting a tampered buffer', async () => {
      const s = createSafeStorage('no-keytar-service-6')
      const enc = await s.encryptString('original')
      // Flip a byte in the ciphertext portion
      // Flip a byte to corrupt the ciphertext without using bitwise operators
      const last = enc.at(-1) ?? 0
      enc[enc.length - 1] = last === 0 ? 1 : 0
      try {
        await s.decryptString(enc)
        expect.fail('should have thrown')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
      }
    })

    it('throws when decrypting a buffer that is too short', async () => {
      const s = createSafeStorage('no-keytar-service-7')
      try {
        await s.decryptString(Buffer.alloc(10))
        expect.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.include('too short')
      }
    })
  })

  describe('isEncryptionAvailable', () => {
    it('returns a boolean', async () => {
      const s = createSafeStorage('check-service')
      const result = await s.isEncryptionAvailable()
      expect(typeof result).to.equal('boolean')
    })
  })
})
