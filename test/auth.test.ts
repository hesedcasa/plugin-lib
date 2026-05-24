import {assert, expect} from 'chai'
import {default as fs} from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {createSandbox} from 'sinon'

import {type AuthCommandOptions, createAuthTestCommand} from '../src/auth.js'

// Factory functions return `typeof Command` (abstract) but the produced class is always concrete.
// This helper isolates the one necessary cast so call sites stay readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (Cls: ReturnType<typeof createAuthTestCommand>, argv: string[] = []) => (Cls as any).run(argv, import.meta.url)

describe('createAuthTestCommand', () => {
  const sandbox = createSandbox()
  let tmpDir: string
  let savedXdg: string | undefined

  // oclif derives configDir as path.join(XDG_CONFIG_HOME, config.bin)
  // config.bin = "@hesed/plugin-lib" (from package.json name)
  function configFilePath(): string {
    return path.join(tmpDir, '@hesed/plugin-lib', 'test-cli-config.json')
  }

  function makeOptions(overrides?: Partial<AuthCommandOptions>): AuthCommandOptions {
    return {
      clearClients: sandbox.stub(),
      configFile: 'test-cli-config.json',
      hasHostFlag: true,
      serviceName: 'TestService',
      testConnection: sandbox.stub().resolves({success: true}),
      ...overrides,
    }
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-lib-cmd-'))
    savedXdg = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = tmpDir
  })

  afterEach(async () => {
    sandbox.restore()
    if (savedXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME
    } else {
      process.env.XDG_CONFIG_HOME = savedXdg
    }

    await fs.remove(tmpDir)
  })

  it('throws when no auth config exists', async () => {
    try {
      await run(createAuthTestCommand(makeOptions()))
      assert.fail('should have thrown')
    } catch (error) {
      expect((error as Error).message).to.include('Missing authentication config')
    }
  })

  it('calls testConnection with the resolved auth config', async () => {
    await fs.outputJSON(configFilePath(), {
      profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
    })

    const testConnection = sandbox.stub().resolves({success: true})
    await run(createAuthTestCommand(makeOptions({testConnection})))

    expect(testConnection.calledOnce).to.be.true
    expect(testConnection.firstCall.args[0]).to.deep.equal({apiToken: 'mytoken', host: 'https://api.example.com'})
  })

  it('calls clearClients after a successful connection', async () => {
    await fs.outputJSON(configFilePath(), {
      profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
    })

    const clearClients = sandbox.stub()
    await run(createAuthTestCommand(makeOptions({clearClients})))

    expect(clearClients.calledOnce).to.be.true
  })

  it('throws when testConnection returns failure', async () => {
    await fs.outputJSON(configFilePath(), {
      profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
    })

    try {
      await run(createAuthTestCommand(makeOptions({testConnection: sandbox.stub().resolves({success: false})})))
      assert.fail('should have thrown')
    } catch (error) {
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

    const testConnection = sandbox.stub().resolves({success: true})
    await run(createAuthTestCommand(makeOptions({testConnection})), ['--profile', 'work'])

    expect(testConnection.firstCall.args[0]).to.deep.include({
      apiToken: 'work-tok',
      host: 'https://work.example.com',
    })
  })

  it('throws when the named profile does not exist', async () => {
    await fs.outputJSON(configFilePath(), {
      profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
    })

    try {
      await run(createAuthTestCommand(makeOptions()), ['--profile', 'nonexistent'])
      assert.fail('should have thrown')
    } catch (error) {
      // readConfig logs "Profile 'nonexistent' not found" then returns undefined;
      // the command converts any undefined config into this error.
      expect((error as Error).message).to.include('Missing authentication config')
    }
  })
})
