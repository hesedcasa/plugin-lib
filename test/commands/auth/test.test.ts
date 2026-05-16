import {assert, expect} from 'chai'
import {default as fs} from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {createSandbox} from 'sinon'

import AuthTest from '../../../src/commands/auth/test.js'

// oclif derives configDir from XDG_CONFIG_HOME; we redirect it to a temp dir
// so tests never touch the real user config.
describe('auth test', () => {
  const sandbox = createSandbox()

  // bin = @hesed/plugin-lib → configDir = <XDG_CONFIG_HOME>/@hesed/plugin-lib
  // config file = <configDir>/@hesed/plugin-lib-config.json
  let tmpDir: string
  let savedXdg: string | undefined

  function configFilePath(): string {
    return path.join(tmpDir, '@hesed/plugin-lib', '@hesed/plugin-lib-config.json')
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-lib-cmd-'))
    savedXdg = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = tmpDir
  })

  afterEach(async () => {
    sandbox.restore()
    process.env.XDG_CONFIG_HOME = savedXdg
    await fs.remove(tmpDir)
  })

  it('returns error result when no auth config exists', async () => {
    const result = await AuthTest.run([], import.meta.url)
    expect(result).to.deep.equal({error: 'Missing authentication config', success: false})
  })

  it('uses Bearer token when authConfig has no email', async () => {
    await fs.outputJSON(configFilePath(), {
      profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
    })

    let capturedAuth = ''
    sandbox.stub(globalThis, 'fetch').callsFake(async (_url: unknown, init?: Parameters<typeof globalThis.fetch>[1]) => {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      capturedAuth = new Headers(init?.headers).get('authorization') ?? ''
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      return new Response(JSON.stringify({}), {status: 200})
    })

    const result = await AuthTest.run([], import.meta.url)
    expect(capturedAuth).to.equal('Bearer mytoken')
    expect(result).to.deep.equal({data: {}, success: true})
  })

  it('uses Basic auth when authConfig includes an email', async () => {
    await fs.outputJSON(configFilePath(), {
      profiles: {
        default: {apiToken: 'mytoken', email: 'user@example.com', host: 'https://api.example.com'},
      },
    })

    let capturedAuth = ''
    sandbox.stub(globalThis, 'fetch').callsFake(async (_url: unknown, init?: Parameters<typeof globalThis.fetch>[1]) => {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      capturedAuth = new Headers(init?.headers).get('authorization') ?? ''
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      return new Response(JSON.stringify({}), {status: 200})
    })

    await AuthTest.run([], import.meta.url)
    expect(capturedAuth).to.equal(`Basic ${Buffer.from('user@example.com:mytoken').toString('base64')}`)
  })

  it('throws when the API responds with a non-ok status', async () => {
    await fs.outputJSON(configFilePath(), {
      profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
    })

    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    sandbox.stub(globalThis, 'fetch').resolves(new Response('Unauthorized', {status: 401}))

    try {
      await AuthTest.run([], import.meta.url)
      assert.fail('should have thrown')
    } catch (error) {
      expect(error).to.be.instanceOf(Error)
      expect((error as Error).message).to.include('Failed to connect')
    }
  })

  it('uses the named profile when --profile flag is given', async () => {
    await fs.outputJSON(configFilePath(), {
      profiles: {
        default: {apiToken: 'default-tok', host: 'https://default.example.com'},
        work: {apiToken: 'work-tok', host: 'https://work.example.com'},
      },
    })

    let capturedUrl = ''
    sandbox.stub(globalThis, 'fetch').callsFake(async (url: unknown) => {
      capturedUrl = String(url)
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      return new Response(JSON.stringify({}), {status: 200})
    })

    await AuthTest.run(['--profile', 'work'], import.meta.url)
    expect(capturedUrl).to.match(/^https:\/\/work\.example\.com/)
  })
})
