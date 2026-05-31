import {expect} from 'chai'
import {default as fs} from 'fs-extra'
import {createSandbox} from 'sinon'

import {resolveSecrets, resolveSecretValue} from '../src/secrets.js'

describe('secrets', () => {
  const sandbox = createSandbox()

  afterEach(() => {
    sandbox.restore()
    delete process.env.TEST_SECRET_VAR
  })

  describe('resolveSecretValue', () => {
    it('returns the value unchanged when no prefix is present', async () => {
      expect(await resolveSecretValue('plain-value')).to.equal('plain-value')
    })

    it('resolves env: prefix from process.env', async () => {
      process.env.TEST_SECRET_VAR = 'my-secret'
      expect(await resolveSecretValue('env:TEST_SECRET_VAR')).to.equal('my-secret')
    })

    it('throws when env: variable is not set', async () => {
      try {
        await resolveSecretValue('env:UNSET_VAR_XYZ')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include(
          "Environment variable 'UNSET_VAR_XYZ' is not set",
        )
      }
    })

    it('resolves file: prefix by reading the file', async () => {
      sandbox.stub(fs, 'readFile').resolves('file-secret\n' as unknown as Buffer)
      expect(await resolveSecretValue('file:/run/secrets/token')).to.equal('file-secret')
    })

    it('trims whitespace from file contents', async () => {
      sandbox.stub(fs, 'readFile').resolves('  padded-secret  \n' as unknown as Buffer)
      expect(await resolveSecretValue('file:/run/secrets/token')).to.equal('padded-secret')
    })

    it('throws when file: path cannot be read', async () => {
      sandbox.stub(fs, 'readFile').rejects(new Error('ENOENT: no such file or directory'))
      try {
        await resolveSecretValue('file:/nonexistent/secret')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include(
          "Failed to read secret from file '/nonexistent/secret'",
        )
      }
    })
  })

  describe('resolveSecrets', () => {
    it('resolves env: references in string fields', async () => {
      process.env.TEST_SECRET_VAR = 'resolved-token'
      const result = await resolveSecrets({apiToken: 'env:TEST_SECRET_VAR', host: 'https://example.com'})
      expect(result).to.deep.equal({apiToken: 'resolved-token', host: 'https://example.com'})
    })

    it('leaves non-string fields untouched', async () => {
      const result = await resolveSecrets({count: 42, enabled: true, name: 'plain'})
      expect(result).to.deep.equal({count: 42, enabled: true, name: 'plain'})
    })

    it('passes through literal string values unchanged', async () => {
      const result = await resolveSecrets({apiToken: 'tok-abc', host: 'https://example.com'})
      expect(result).to.deep.equal({apiToken: 'tok-abc', host: 'https://example.com'})
    })

    it('resolves file: references in string fields', async () => {
      sandbox.stub(fs, 'readFile').resolves('file-token\n' as unknown as Buffer)
      const result = await resolveSecrets({apiToken: 'file:/run/secrets/token'})
      expect(result).to.deep.equal({apiToken: 'file-token'})
    })

    it('returns non-object values unchanged', async () => {
      expect(await resolveSecrets(null as unknown as object)).to.be.null
      expect(await resolveSecrets(undefined as unknown as object)).to.be.undefined
    })
  })
})
