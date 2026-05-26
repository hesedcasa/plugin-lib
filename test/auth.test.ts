import {assert, expect} from 'chai'
import {default as fs} from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {createSandbox} from 'sinon'

import {type AuthCommandOptions, createAuthDeleteCommand, createAuthTestCommand} from '../src/auth.js'

// Factory functions return `typeof Command` (abstract) but the produced class is always concrete.
// This helper isolates the one necessary cast so call sites stay readable.
const run = (Cls: ReturnType<typeof createAuthDeleteCommand | typeof createAuthTestCommand>, argv: string[] = []) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Cls as any).run(argv, import.meta.url)

describe('auth commands', () => {
  const sandbox = createSandbox()
  let tmpDir: string
  let savedXdg: string | undefined

  // oclif derives configDir as path.join(XDG_CONFIG_HOME, config.bin)
  // config.bin = "@hesed/plugin-lib" (from package.json name); configFile = `${bin}-config.json`
  function configFilePath(): string {
    return path.join(tmpDir, '@hesed/plugin-lib', '@hesed/plugin-lib-config.json')
  }

  function makeOptions(overrides?: Partial<AuthCommandOptions>): AuthCommandOptions {
    return {
      clearClients: sandbox.stub(),
      hasHostFlag: true,
      serviceName: 'TestService',
      testConnection: sandbox.stub().resolves({success: true}),
      ...overrides,
    }
  }

  let savedIsTTY: boolean | undefined

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-lib-cmd-'))
    savedXdg = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = tmpDir
    savedIsTTY = process.stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: false, writable: true})
  })

  afterEach(async () => {
    sandbox.restore()
    if (savedXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME
    } else {
      process.env.XDG_CONFIG_HOME = savedXdg
    }

    Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: savedIsTTY, writable: true})
    await fs.remove(tmpDir)
  })

  describe('createAuthTestCommand', () => {
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

  describe('createAuthDeleteCommand', () => {
    it('throws when no profiles exist', async () => {
      try {
        await run(createAuthDeleteCommand())
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.include('No authentication profiles found')
      }
    })

    it('throws when the profile does not exist', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
      })

      try {
        await run(createAuthDeleteCommand(), ['--profile', 'nonexistent'])
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.include("Profile 'nonexistent' does not exist")
      }
    })

    it('deletes the specified profile', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {
          default: {apiToken: 'default-tok', host: 'https://default.example.com'},
          work: {apiToken: 'work-tok', host: 'https://work.example.com'},
        },
      })

      await run(createAuthDeleteCommand(), ['--profile', 'work'])

      const config = await fs.readJSON(configFilePath())
      expect(config.profiles).to.deep.equal({default: {apiToken: 'default-tok', host: 'https://default.example.com'}})
    })

    it('clears defaultProfile when deleting the last profile', async () => {
      await fs.outputJSON(configFilePath(), {
        defaultProfile: 'work',
        profiles: {work: {apiToken: 'work-tok', host: 'https://work.example.com'}},
      })

      await run(createAuthDeleteCommand(), ['--profile', 'work'])

      const config = await fs.readJSON(configFilePath())
      expect(config).to.not.have.property('defaultProfile')
      expect(config.profiles).to.deep.equal({})
    })

    it('updates defaultProfile when deleting the current default and other profiles exist', async () => {
      await fs.outputJSON(configFilePath(), {
        defaultProfile: 'work',
        profiles: {
          personal: {apiToken: 'personal-tok', host: 'https://personal.example.com'},
          work: {apiToken: 'work-tok', host: 'https://work.example.com'},
        },
      })

      await run(createAuthDeleteCommand(), ['--profile', 'work'])

      const config = await fs.readJSON(configFilePath())
      expect(config.defaultProfile).to.equal('personal')
      expect(config.profiles).to.deep.equal({
        personal: {apiToken: 'personal-tok', host: 'https://personal.example.com'},
      })
    })

    it('does not change defaultProfile when deleting a non-default profile', async () => {
      await fs.outputJSON(configFilePath(), {
        defaultProfile: 'work',
        profiles: {
          personal: {apiToken: 'personal-tok', host: 'https://personal.example.com'},
          work: {apiToken: 'work-tok', host: 'https://work.example.com'},
        },
      })

      await run(createAuthDeleteCommand(), ['--profile', 'personal'])

      const config = await fs.readJSON(configFilePath())
      expect(config.defaultProfile).to.equal('work')
      expect(config.profiles).to.deep.equal({work: {apiToken: 'work-tok', host: 'https://work.example.com'}})
    })
  })
})
