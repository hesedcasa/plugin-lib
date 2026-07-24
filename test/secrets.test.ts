import {expect} from 'chai'
import {default as fs} from 'fs-extra'
import {createSandbox} from 'sinon'

import {resolveSecrets, resolveSecretValue, resolveVaultSecret, vaultHttp} from '../src/secrets.js'

describe('secrets', () => {
  const sandbox = createSandbox()

  afterEach(() => {
    sandbox.restore()
    delete process.env.TEST_SECRET_VAR
    delete process.env.VAULT_ADDR
    delete process.env.VAULT_TOKEN
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

  describe('resolveVaultSecret', () => {
    beforeEach(() => {
      process.env.VAULT_TOKEN = 'test-token'
    })

    it('resolves a key from a KV v2 secret', async () => {
      const get = sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {data: {apiToken: 'kv2-secret'}}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      expect(await resolveVaultSecret('secret/data/app#apiToken')).to.equal('kv2-secret')
      expect(get.calledOnceWith('http://127.0.0.1:8200/v1/secret/data/app', 'test-token')).to.be.true
    })

    it('resolves a key from a KV v1 secret', async () => {
      sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {apiToken: 'kv1-secret'}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      expect(await resolveVaultSecret('secret/app#apiToken')).to.equal('kv1-secret')
    })

    it('honors VAULT_ADDR and strips trailing slashes', async () => {
      process.env.VAULT_ADDR = 'https://vault.example.com/'
      const get = sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {data: {token: 'x'}}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      await resolveVaultSecret('secret/data/app#token')
      expect(get.firstCall.args[0]).to.equal('https://vault.example.com/v1/secret/data/app')
    })

    it('throws when the reference is missing a key', async () => {
      try {
        await resolveVaultSecret('secret/data/app')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('Invalid Vault reference')
      }
    })

    it('throws when VAULT_TOKEN is not set', async () => {
      delete process.env.VAULT_TOKEN
      try {
        await resolveVaultSecret('secret/data/app#apiToken')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('VAULT_TOKEN is not set')
      }
    })

    it('throws on a non-2xx response', async () => {
      sandbox.stub(vaultHttp, 'get').resolves({body: '', statusCode: 403, statusMessage: 'Forbidden'})
      try {
        await resolveVaultSecret('secret/data/app#apiToken')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('failed with status 403')
      }
    })

    it('throws when a network error occurs', async () => {
      sandbox.stub(vaultHttp, 'get').rejects(new Error('ECONNREFUSED'))
      try {
        await resolveVaultSecret('secret/data/app#apiToken')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('Failed to reach Vault')
      }
    })

    it('throws when the key is not present in the secret', async () => {
      sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {data: {other: 'value'}}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      try {
        await resolveVaultSecret('secret/data/app#missing')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include("Key 'missing' not found")
      }
    })

    it('is reachable through resolveSecretValue via the vault: prefix', async () => {
      sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {data: {apiToken: 'via-prefix'}}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      expect(await resolveSecretValue('vault:secret/data/app#apiToken')).to.equal('via-prefix')
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
