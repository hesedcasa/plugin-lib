import type {AddressInfo} from 'node:net'

import {expect} from 'chai'
import {default as fs} from 'fs-extra'
import {createServer} from 'node:http'
import {createSandbox} from 'sinon'

import type {InfisicalResponse, VaultResponse} from '../src/secrets.js'

import {
  clearInfisicalAuthCache,
  clearInfisicalSecretCache,
  clearVaultSecretCache,
  infisicalHttp,
  resolveInfisicalSecret,
  resolveSecrets,
  resolveSecretValue,
  resolveVaultSecret,
  vaultHttp,
} from '../src/secrets.js'

const infisicalSecretBody = (secretValue: string) => ({
  body: JSON.stringify({secret: {secretKey: 'API_TOKEN', secretValue}}),
  statusCode: 200,
  statusMessage: 'OK',
})

describe('secrets', () => {
  const sandbox = createSandbox()

  afterEach(() => {
    sandbox.restore()
    clearInfisicalAuthCache()
    clearInfisicalSecretCache()
    clearVaultSecretCache()
    delete process.env.TEST_SECRET_VAR
    delete process.env.INFISICAL_CACHE_TTL
    delete process.env.VAULT_CACHE_TTL
    delete process.env.VAULT_ADDR
    delete process.env.VAULT_TOKEN
    delete process.env.VAULT_REQUEST_TIMEOUT
    delete process.env.INFISICAL_ALLOW_INSECURE_HTTP
    delete process.env.INFISICAL_CLIENT_ID
    delete process.env.INFISICAL_CLIENT_SECRET
    delete process.env.INFISICAL_ENVIRONMENT
    delete process.env.INFISICAL_PROJECT_ID
    delete process.env.INFISICAL_REQUEST_TIMEOUT
    delete process.env.INFISICAL_SECRET_PATH
    delete process.env.INFISICAL_SITE_URL
    delete process.env.INFISICAL_TOKEN
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
        body: JSON.stringify({data: {data: {apiToken: 'kv2-secret'}, metadata: {version: 1}}}),
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

    it('resolves a KV v1 secret that itself contains a field named data', async () => {
      // No metadata sibling → treated as KV v1, so the literal `data` field must
      // not be mistaken for a KV v2 payload.
      sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {apiToken: 'kv1-with-data', data: {nested: 'ignore-me'}}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      expect(await resolveVaultSecret('secret/app#apiToken')).to.equal('kv1-with-data')
    })

    it('reads a payload with a metadata sibling and object-valued data as KV v2', async () => {
      // This is the canonical KV v2 envelope: `{ data: {...}, metadata: {...} }`.
      // Real Vault always returns this shape for v2, so the nested object is the
      // secret. (A KV v1 secret cannot reach this branch without literally
      // storing both `metadata` and an object `data` field — a payload that is
      // byte-identical to a v2 envelope and thus undecidable from the body alone.)
      sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {data: {apiToken: 'nested-v2'}, metadata: {version: 3}}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      expect(await resolveVaultSecret('secret/data/app#apiToken')).to.equal('nested-v2')
    })

    it('honors VAULT_ADDR and strips trailing slashes', async () => {
      process.env.VAULT_ADDR = 'https://vault.example.com/'
      const get = sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {data: {token: 'x'}, metadata: {version: 1}}}),
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

    it('rejects instead of hanging when the response stalls (real request)', async () => {
      // Server sends headers then never ends the body; get() must time out.
      const server = createServer((_req, res) => {
        res.writeHead(200, {'Content-Type': 'application/json'})
        res.write('{"data":')
      })
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve)
      })
      const {port} = server.address() as AddressInfo
      process.env.VAULT_REQUEST_TIMEOUT = '75'
      try {
        await vaultHttp.get(`http://127.0.0.1:${port}/v1/secret/data/app`, 'test-token')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('timed out')
      } finally {
        server.close()
      }
    })

    it('throws when the key is not present in the secret', async () => {
      sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {data: {other: 'value'}, metadata: {version: 1}}}),
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

    it('serves several keys from one path with a single request', async () => {
      const get = sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {data: {apiToken: 'T', email: 'E', host: 'H'}, metadata: {version: 1}}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      // A Vault response carries the whole secret, so picking three keys out of
      // one path must not cost three round trips.
      const values = await Promise.all([
        resolveVaultSecret('secret/data/app#apiToken'),
        resolveVaultSecret('secret/data/app#host'),
        resolveVaultSecret('secret/data/app#email'),
      ])
      expect(values).to.deep.equal(['T', 'H', 'E'])
      expect(get.callCount).to.equal(1)
    })

    it('still issues separate requests for different paths', async () => {
      const get = sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {apiToken: 'T'}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      await Promise.all([resolveVaultSecret('secret/one#apiToken'), resolveVaultSecret('secret/two#apiToken')])
      expect(get.callCount).to.equal(2)
    })

    it('refetches on a later call when no TTL is configured', async () => {
      const get = sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {apiToken: 'T'}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      await resolveVaultSecret('secret/app#apiToken')
      await resolveVaultSecret('secret/app#apiToken')
      expect(get.callCount).to.equal(2)
    })

    it('reuses a cached secret while VAULT_CACHE_TTL is live', async () => {
      process.env.VAULT_CACHE_TTL = '60'
      const get = sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {apiToken: 'T', host: 'H'}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      expect(await resolveVaultSecret('secret/app#apiToken')).to.equal('T')
      expect(await resolveVaultSecret('secret/app#host')).to.equal('H')
      expect(await resolveVaultSecret('secret/app#apiToken')).to.equal('T')
      expect(get.callCount).to.equal(1)
    })

    it('refetches once a cached secret has expired', async () => {
      process.env.VAULT_CACHE_TTL = '0.02'
      const get = sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {apiToken: 'T'}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      await resolveVaultSecret('secret/app#apiToken')
      await new Promise((resolve) => {
        setTimeout(resolve, 40)
      })
      await resolveVaultSecret('secret/app#apiToken')
      expect(get.callCount).to.equal(2)
    })

    it('drops cached secrets on clearVaultSecretCache', async () => {
      process.env.VAULT_CACHE_TTL = '60'
      const get = sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {apiToken: 'T'}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      await resolveVaultSecret('secret/app#apiToken')
      clearVaultSecretCache()
      await resolveVaultSecret('secret/app#apiToken')
      expect(get.callCount).to.equal(2)
    })

    it('does not let an in-flight fetch repopulate a cleared cache', async () => {
      process.env.VAULT_CACHE_TTL = '60'

      let releaseFetch!: (value: VaultResponse) => void
      const pendingFetch = new Promise<VaultResponse>((resolve) => {
        releaseFetch = resolve
      })
      const get = sandbox.stub(vaultHttp, 'get')
      get.onFirstCall().returns(pendingFetch)
      get.onSecondCall().resolves({
        body: JSON.stringify({data: {apiToken: 'second'}}),
        statusCode: 200,
        statusMessage: 'OK',
      })

      const inFlight = resolveVaultSecret('secret/app#apiToken')
      clearVaultSecretCache()
      releaseFetch({body: JSON.stringify({data: {apiToken: 'first'}}), statusCode: 200, statusMessage: 'OK'})
      await inFlight

      expect(await resolveVaultSecret('secret/app#apiToken')).to.equal('second')
      expect(get.callCount).to.equal(2)
    })

    it('reports a missing key without caching it as a failure', async () => {
      process.env.VAULT_CACHE_TTL = '60'
      const get = sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {apiToken: 'T'}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      try {
        await resolveVaultSecret('secret/app#missing')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include("Key 'missing' not found")
      }

      // The path itself was fetched successfully, so a sibling key is served
      // from that same cached payload.
      expect(await resolveVaultSecret('secret/app#apiToken')).to.equal('T')
      expect(get.callCount).to.equal(1)
    })

    it('is reachable through resolveSecretValue via the vault: prefix', async () => {
      sandbox.stub(vaultHttp, 'get').resolves({
        body: JSON.stringify({data: {data: {apiToken: 'via-prefix'}, metadata: {version: 1}}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      expect(await resolveSecretValue('vault:secret/data/app#apiToken')).to.equal('via-prefix')
    })
  })

  describe('resolveInfisicalSecret', () => {
    beforeEach(() => {
      process.env.INFISICAL_TOKEN = 'test-access-token'
    })

    it('resolves a secret against the default site URL', async () => {
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('cloud-secret'))
      expect(await resolveInfisicalSecret('proj-123/prod#API_TOKEN')).to.equal('cloud-secret')
      expect(get.firstCall.args[0]).to.equal(
        'https://app.infisical.com/api/v3/secrets/raw/API_TOKEN?environment=prod&expandSecretReferences=true&secretPath=%2F&viewSecretValue=true&workspaceId=proj-123',
      )
      expect(get.firstCall.args[1]).to.equal('test-access-token')
    })

    it('reads a nested secret path from the reference', async () => {
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('nested-secret'))
      expect(await resolveInfisicalSecret('proj-123/prod/database/primary#PASSWORD')).to.equal('nested-secret')
      expect(get.firstCall.args[0]).to.include('secretPath=%2Fdatabase%2Fprimary')
    })

    it('honors INFISICAL_SITE_URL and strips trailing slashes', async () => {
      process.env.INFISICAL_SITE_URL = 'https://infisical.internal/'
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('self-hosted'))
      expect(await resolveInfisicalSecret('proj-123/prod#API_TOKEN')).to.equal('self-hosted')
      expect(get.firstCall.args[0]).to.match(/^https:\/\/infisical\.internal\/api\/v3\/secrets\/raw\/API_TOKEN\?/)
    })

    it('falls back to INFISICAL_PROJECT_ID, INFISICAL_ENVIRONMENT and INFISICAL_SECRET_PATH', async () => {
      process.env.INFISICAL_ENVIRONMENT = 'staging'
      process.env.INFISICAL_PROJECT_ID = 'proj-from-env'
      process.env.INFISICAL_SECRET_PATH = '/shared'
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('from-env-defaults'))
      expect(await resolveInfisicalSecret('#API_TOKEN')).to.equal('from-env-defaults')
      expect(get.firstCall.args[0]).to.include('environment=staging')
      expect(get.firstCall.args[0]).to.include('secretPath=%2Fshared')
      expect(get.firstCall.args[0]).to.include('workspaceId=proj-from-env')
    })

    it('percent-encodes a secret name with URL-unsafe characters', async () => {
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('encoded'))
      await resolveInfisicalSecret('proj-123/prod#my token/v2')
      expect(get.firstCall.args[0]).to.include('/api/v3/secrets/raw/my%20token%2Fv2?')
    })

    it('logs in with universal auth when no INFISICAL_TOKEN is set', async () => {
      delete process.env.INFISICAL_TOKEN
      process.env.INFISICAL_CLIENT_ID = 'client-id'
      process.env.INFISICAL_CLIENT_SECRET = 'client-secret'
      const post = sandbox.stub(infisicalHttp, 'post').resolves({
        body: JSON.stringify({accessToken: 'issued-token', expiresIn: 3600}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('via-universal-auth'))

      expect(await resolveInfisicalSecret('proj-123/prod#API_TOKEN')).to.equal('via-universal-auth')
      expect(
        post.calledOnceWith('https://app.infisical.com/api/v1/auth/universal-auth/login', {
          clientId: 'client-id',
          clientSecret: 'client-secret',
        }),
      ).to.be.true
      expect(get.firstCall.args[1]).to.equal('issued-token')
    })

    it('reuses a cached access token across concurrent resolutions', async () => {
      delete process.env.INFISICAL_TOKEN
      process.env.INFISICAL_CLIENT_ID = 'client-id'
      process.env.INFISICAL_CLIENT_SECRET = 'client-secret'
      const post = sandbox.stub(infisicalHttp, 'post').resolves({
        body: JSON.stringify({accessToken: 'issued-token', expiresIn: 3600}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('cached'))

      // Two concurrent calls must share one login, and a later serial call must
      // reuse the cached token rather than logging in again.
      await Promise.all([resolveInfisicalSecret('proj-123/prod#A'), resolveInfisicalSecret('proj-123/prod#B')])
      await resolveInfisicalSecret('proj-123/prod#C')
      expect(post.callCount).to.equal(1)
    })

    it('does not let an in-flight login repopulate a cleared cache', async () => {
      delete process.env.INFISICAL_TOKEN
      process.env.INFISICAL_CLIENT_ID = 'client-id'
      process.env.INFISICAL_CLIENT_SECRET = 'client-secret'

      let releaseLogin!: (value: InfisicalResponse) => void
      const pendingLogin = new Promise<InfisicalResponse>((resolve) => {
        releaseLogin = resolve
      })
      const post = sandbox.stub(infisicalHttp, 'post')
      post.onFirstCall().returns(pendingLogin)
      post.onSecondCall().resolves({
        body: JSON.stringify({accessToken: 'second-token', expiresIn: 3600}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('value'))

      // Credentials are rotated while the first login is still on the wire.
      const inFlight = resolveInfisicalSecret('proj-123/prod#A')
      clearInfisicalAuthCache()
      releaseLogin({
        body: JSON.stringify({accessToken: 'first-token', expiresIn: 3600}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      await inFlight

      // The stale token must not survive the clear: the next resolution logs in again.
      await resolveInfisicalSecret('proj-123/prod#B')
      expect(post.callCount).to.equal(2)
      expect(get.secondCall.args[1]).to.equal('second-token')
    })

    it('shares one request between concurrent resolutions of the same reference', async () => {
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('deduped'))
      const values = await Promise.all([
        resolveInfisicalSecret('proj-123/prod#API_TOKEN'),
        resolveInfisicalSecret('proj-123/prod#API_TOKEN'),
        resolveInfisicalSecret('proj-123/prod#API_TOKEN'),
      ])
      expect(values).to.deep.equal(['deduped', 'deduped', 'deduped'])
      expect(get.callCount).to.equal(1)
    })

    it('still issues separate requests for different references', async () => {
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('v'))
      await Promise.all([resolveInfisicalSecret('proj-123/prod#A'), resolveInfisicalSecret('proj-123/prod#B')])
      expect(get.callCount).to.equal(2)
    })

    it('treats the same secret name in a different path as a distinct reference', async () => {
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('v'))
      await Promise.all([
        resolveInfisicalSecret('proj-123/prod/one#API_TOKEN'),
        resolveInfisicalSecret('proj-123/prod/two#API_TOKEN'),
      ])
      expect(get.callCount).to.equal(2)
    })

    it('refetches on a later call when no TTL is configured', async () => {
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('fresh'))
      await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
      await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
      // Caching is opt-in; without INFISICAL_CACHE_TTL every resolution hits the API.
      expect(get.callCount).to.equal(2)
    })

    it('reuses a cached value while INFISICAL_CACHE_TTL is live', async () => {
      process.env.INFISICAL_CACHE_TTL = '60'
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('cached'))
      expect(await resolveInfisicalSecret('proj-123/prod#API_TOKEN')).to.equal('cached')
      expect(await resolveInfisicalSecret('proj-123/prod#API_TOKEN')).to.equal('cached')
      expect(await resolveInfisicalSecret('proj-123/prod#API_TOKEN')).to.equal('cached')
      expect(get.callCount).to.equal(1)
    })

    it('refetches once a cached value has expired', async () => {
      process.env.INFISICAL_CACHE_TTL = '0.02'
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('short-lived'))
      await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
      await new Promise((resolve) => {
        setTimeout(resolve, 40)
      })
      await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
      expect(get.callCount).to.equal(2)
    })

    it('ignores a non-numeric or negative INFISICAL_CACHE_TTL', async () => {
      process.env.INFISICAL_CACHE_TTL = 'soon'
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('v'))
      await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
      await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
      expect(get.callCount).to.equal(2)
    })

    it('drops cached values on clearInfisicalSecretCache', async () => {
      process.env.INFISICAL_CACHE_TTL = '60'
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('v'))
      await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
      clearInfisicalSecretCache()
      await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
      expect(get.callCount).to.equal(2)
    })

    it('drops cached values on clearInfisicalAuthCache too', async () => {
      process.env.INFISICAL_CACHE_TTL = '60'
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('v'))
      await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
      clearInfisicalAuthCache()
      await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
      expect(get.callCount).to.equal(2)
    })

    it('does not let an in-flight fetch repopulate a cleared value cache', async () => {
      process.env.INFISICAL_CACHE_TTL = '60'

      let releaseFetch!: (value: InfisicalResponse) => void
      const pendingFetch = new Promise<InfisicalResponse>((resolve) => {
        releaseFetch = resolve
      })
      const get = sandbox.stub(infisicalHttp, 'get')
      get.onFirstCall().returns(pendingFetch)
      get.onSecondCall().resolves(infisicalSecretBody('second'))
      get.onThirdCall().resolves(infisicalSecretBody('third'))

      const inFlight = resolveInfisicalSecret('proj-123/prod#API_TOKEN')
      clearInfisicalSecretCache()
      releaseFetch(infisicalSecretBody('first'))
      await inFlight

      // The stale fetch must not have seeded the cache the clear just emptied.
      expect(await resolveInfisicalSecret('proj-123/prod#API_TOKEN')).to.equal('second')
      expect(get.callCount).to.equal(2)
    })

    it('does not cache a token when the login response omits expiresIn', async () => {
      delete process.env.INFISICAL_TOKEN
      process.env.INFISICAL_CLIENT_ID = 'client-id'
      process.env.INFISICAL_CLIENT_SECRET = 'client-secret'
      const post = sandbox.stub(infisicalHttp, 'post').resolves({
        body: JSON.stringify({accessToken: 'issued-token'}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('uncached'))

      await resolveInfisicalSecret('proj-123/prod#A')
      await resolveInfisicalSecret('proj-123/prod#B')
      expect(post.callCount).to.equal(2)
    })

    it('refuses to send credentials over plaintext HTTP to a non-loopback host', async () => {
      process.env.INFISICAL_SITE_URL = 'http://infisical.internal'
      const get = sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('never-fetched'))
      try {
        await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('plaintext HTTP')
      }

      // The guard must run before anything reaches the wire.
      expect(get.called).to.be.false
    })

    it('blocks plaintext HTTP before a universal-auth login leaks the client secret', async () => {
      delete process.env.INFISICAL_TOKEN
      process.env.INFISICAL_CLIENT_ID = 'client-id'
      process.env.INFISICAL_CLIENT_SECRET = 'client-secret'
      process.env.INFISICAL_SITE_URL = 'http://infisical.internal'
      const post = sandbox.stub(infisicalHttp, 'post').resolves({
        body: JSON.stringify({accessToken: 'leaked', expiresIn: 3600}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      try {
        await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch {
        // asserted below
      }

      expect(post.called).to.be.false
    })

    for (const siteUrl of ['http://127.0.0.1:8080', 'http://localhost:8080', 'http://[::1]:8080']) {
      it(`allows plaintext HTTP to the loopback address ${siteUrl}`, async () => {
        process.env.INFISICAL_SITE_URL = siteUrl
        sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('loopback-ok'))
        expect(await resolveInfisicalSecret('proj-123/prod#API_TOKEN')).to.equal('loopback-ok')
      })
    }

    it('allows non-loopback plaintext HTTP when INFISICAL_ALLOW_INSECURE_HTTP is set', async () => {
      process.env.INFISICAL_ALLOW_INSECURE_HTTP = 'true'
      process.env.INFISICAL_SITE_URL = 'http://infisical.internal'
      sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('opted-in'))
      expect(await resolveInfisicalSecret('proj-123/prod#API_TOKEN')).to.equal('opted-in')
    })

    it('throws on a malformed site URL', async () => {
      process.env.INFISICAL_SITE_URL = 'not-a-url'
      try {
        await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('Invalid Infisical site URL')
      }
    })

    it('throws when the reference is missing a secret name', async () => {
      try {
        await resolveInfisicalSecret('proj-123/prod')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('Invalid Infisical reference')
      }
    })

    it('throws when the locator has a single ambiguous segment', async () => {
      try {
        await resolveInfisicalSecret('proj-123#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('Invalid Infisical reference')
      }
    })

    it('throws when the project ID is neither in the reference nor the environment', async () => {
      try {
        await resolveInfisicalSecret('#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('INFISICAL_PROJECT_ID is not set')
      }
    })

    it('throws when the environment is neither in the reference nor the environment vars', async () => {
      process.env.INFISICAL_PROJECT_ID = 'proj-from-env'
      try {
        await resolveInfisicalSecret('#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('INFISICAL_ENVIRONMENT is not set')
      }
    })

    it('throws when no credentials are configured', async () => {
      delete process.env.INFISICAL_TOKEN
      try {
        await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('Infisical credentials are not set')
      }
    })

    it('throws when universal auth returns no access token', async () => {
      delete process.env.INFISICAL_TOKEN
      process.env.INFISICAL_CLIENT_ID = 'client-id'
      process.env.INFISICAL_CLIENT_SECRET = 'client-secret'
      sandbox.stub(infisicalHttp, 'post').resolves({body: JSON.stringify({}), statusCode: 200, statusMessage: 'OK'})
      try {
        await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('did not return an access token')
      }
    })

    it('throws on a non-2xx response', async () => {
      sandbox.stub(infisicalHttp, 'get').resolves({body: '', statusCode: 404, statusMessage: 'Not Found'})
      try {
        await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('failed with status 404')
      }
    })

    it('throws when a network error occurs', async () => {
      sandbox.stub(infisicalHttp, 'get').rejects(new Error('ECONNREFUSED'))
      try {
        await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('Failed to reach Infisical')
      }
    })

    it('throws on a non-JSON response body', async () => {
      sandbox.stub(infisicalHttp, 'get').resolves({body: '<html>502</html>', statusCode: 200, statusMessage: 'OK'})
      try {
        await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('non-JSON response')
      }
    })

    it('throws when the response carries no secret value', async () => {
      sandbox.stub(infisicalHttp, 'get').resolves({
        body: JSON.stringify({secret: {secretKey: 'API_TOKEN'}}),
        statusCode: 200,
        statusMessage: 'OK',
      })
      try {
        await resolveInfisicalSecret('proj-123/prod#API_TOKEN')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include("Secret 'API_TOKEN' not found")
      }
    })

    it('rejects instead of hanging when the response stalls (real request)', async () => {
      // Server sends headers then never ends the body; get() must time out.
      const server = createServer((_req, res) => {
        res.writeHead(200, {'Content-Type': 'application/json'})
        res.write('{"secret":')
      })
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve)
      })
      const {port} = server.address() as AddressInfo
      process.env.INFISICAL_REQUEST_TIMEOUT = '75'
      try {
        await infisicalHttp.get(`http://127.0.0.1:${port}/api/v3/secrets/raw/API_TOKEN`, 'test-access-token')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('timed out')
      } finally {
        server.close()
      }
    })

    it('is reachable through resolveSecretValue via the infisical: prefix', async () => {
      sandbox.stub(infisicalHttp, 'get').resolves(infisicalSecretBody('via-prefix'))
      expect(await resolveSecretValue('infisical:proj-123/prod#API_TOKEN')).to.equal('via-prefix')
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
