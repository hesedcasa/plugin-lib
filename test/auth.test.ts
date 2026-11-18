import {Command} from '@oclif/core'
import {assert, expect} from 'chai'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {createSandbox} from 'sinon'

import {
  type AuthCommandOptions,
  createAuthAddCommand,
  createAuthDeleteCommand,
  createAuthTestCommand,
  createAuthUpdateCommand,
  type FieldDef,
} from '../src/auth.js'

// Factory functions return `typeof Command` (abstract) but the produced class is always concrete.
// This helper isolates the one necessary cast so call sites stay readable.
const run = (
  Cls: ReturnType<typeof createAuthAddCommand | typeof createAuthDeleteCommand | typeof createAuthTestCommand>,
  argv: string[] = [],
) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Cls as any).run(argv, import.meta.url)

// Dynamic flag definitions are attached to the returned class but `typeof Command`
// typing hides per-field access, so inspect requiredness through a narrow cast.
const flagRequired = (Cls: ReturnType<typeof createAuthAddCommand>, name: string): boolean | undefined =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Cls.flags as any)[name]?.required

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
      serviceName: 'TestService',
      testConnection: sandbox.stub().resolves({success: true}),
      ...overrides,
    }
  }

  // Simulates flags the command collected without going through the parser
  // (the interactive path): the stub receives complete flags, deliberately
  // omitting `host` when a test resolves the host through command logic.
  function stubParseFlags(flags: Record<string, unknown>): void {
    // `parse` is protected on oclif's Command; cast the prototype to stub the
    // runtime method anyway.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub: any = sandbox.stub(Command.prototype as any, 'parse')
    stub.resolves({args: {}, flags})
  }

  // Requiredness is captured at factory creation, so the TTY state has to be
  // set before constructing and restored before running (update confirmation).
  function withTtyDuring<T>(fn: () => T): T {
    Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: true, writable: true})
    try {
      return fn()
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: false, writable: true})
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

    it('surfaces the reported error alongside the generic failure message', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
      })

      const testConnection = sandbox.stub().resolves({error: "Access denied for user 'root'", success: false})

      try {
        await run(createAuthTestCommand(makeOptions({testConnection})))
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.include('Failed to connect')
        expect((error as Error).message).to.include("Access denied for user 'root'")
      }
    })

    it('surfaces the message of a reported Error instance', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
      })

      const testConnection = sandbox.stub().resolves({error: new Error('ECONNREFUSED 127.0.0.1:3306'), success: false})

      try {
        await run(createAuthTestCommand(makeOptions({testConnection})))
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.include('ECONNREFUSED 127.0.0.1:3306')
      }
    })

    // The shapes redactSecrets recognises are covered in test/redact.test.ts.
    // These two only prove it is wired into both error paths.
    it('redacts the reported detail before it reaches the thrown error', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
      })

      const testConnection = sandbox
        .stub()
        .resolves({error: new Error('upstream rejected Authorization: Bearer secret-token'), success: false})

      try {
        await run(createAuthTestCommand(makeOptions({testConnection})))
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.not.include('secret-token')
        expect((error as Error).message).to.include('[REDACTED]')
      }
    })

    it('redacts the detail reported through the --json error path', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
      })

      const testConnection = sandbox
        .stub()
        .resolves({error: new Error('rejected Authorization: Bearer secret-token'), success: false})

      // --json prints the serialized error rather than rejecting, so the
      // redaction has to be asserted on what actually reaches stdout.
      const chunks: string[] = []
      const write = sandbox.stub(process.stdout, 'write').callsFake((chunk: unknown) => {
        chunks.push(String(chunk))
        return true
      })

      await run(createAuthTestCommand(makeOptions({testConnection})), ['--json'])
      write.restore()

      const output = chunks.join('')
      expect(output).to.include('"error"')
      expect(output).to.not.include('secret-token')
      expect(output).to.include('[REDACTED]')
    })

    it('keeps a non-credential detail intact', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
      })

      const testConnection = sandbox.stub().resolves({
        error: 'connect ECONNREFUSED 127.0.0.1:3306 while reaching https://db.example.test/health',
        success: false,
      })

      try {
        await run(createAuthTestCommand(makeOptions({testConnection})))
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.include('ECONNREFUSED 127.0.0.1:3306')
        expect((error as Error).message).to.include('https://db.example.test/health')
        expect((error as Error).message).to.not.include('[REDACTED]')
      }
    })

    it('keeps the generic message when no detail is reported', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
      })

      try {
        await run(createAuthTestCommand(makeOptions({testConnection: sandbox.stub().resolves({success: false})})))
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.equal('Failed to connect to TestService.')
      }
    })

    it('does not stringify an unusable error value into the message', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {apiToken: 'mytoken', host: 'https://api.example.com'}},
      })

      const testConnection = sandbox.stub().resolves({error: {code: 500}, success: false})

      try {
        await run(createAuthTestCommand(makeOptions({testConnection})))
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.equal('Failed to connect to TestService.')
        expect((error as Error).message).to.not.include('object Object')
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

  describe('createAuthAddCommand', () => {
    const addArgv = ['-p', 'default', '-t', 'mytoken', '-e', 'me@example.com', '-u', 'https://api.example.com']

    it('surfaces the reported error when the connection test fails', async () => {
      const testConnection = sandbox.stub().resolves({error: "Access denied for user 'root'", success: false})

      try {
        await run(createAuthAddCommand(makeOptions({testConnection})), addArgv)
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.include('Authentication is invalid')
        expect((error as Error).message).to.include("Access denied for user 'root'")
      }
    })

    it('keeps the generic message when no detail is reported', async () => {
      const testConnection = sandbox.stub().resolves({success: false})

      try {
        await run(createAuthAddCommand(makeOptions({testConnection})), addArgv)
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.equal('Authentication is invalid. Please check your credentials.')
      }
    })

    describe('with defaultHost', () => {
      const addWithoutHostArgv = ['-p', 'default', '-t', 'mytoken', '-e', 'me@example.com']

      it('stores and tests the configured default host when -u is omitted', async () => {
        const testConnection = sandbox.stub().resolves({success: true})
        await run(
          createAuthAddCommand(makeOptions({defaultHost: 'https://bitbucket.org', testConnection})),
          addWithoutHostArgv,
        )

        const expected = {apiToken: 'mytoken', email: 'me@example.com', host: 'https://bitbucket.org'}
        const config = await fs.readJSON(configFilePath())
        expect(config.profiles.default).to.deep.equal(expected)
        expect(testConnection.calledOnce).to.be.true
        expect(testConnection.firstCall.args[0]).to.deep.equal(expected)
      })

      it('stores and tests an explicit -u instead of the default', async () => {
        const testConnection = sandbox.stub().resolves({success: true})
        await run(createAuthAddCommand(makeOptions({defaultHost: 'https://bitbucket.org', testConnection})), [
          ...addWithoutHostArgv,
          '-u',
          'https://custom.example.test',
        ])

        const expected = {apiToken: 'mytoken', email: 'me@example.com', host: 'https://custom.example.test'}
        const config = await fs.readJSON(configFilePath())
        expect(config.profiles.default).to.deep.equal(expected)
        expect(testConnection.calledOnce).to.be.true
        expect(testConnection.firstCall.args[0]).to.deep.equal(expected)
      })

      it('uses whichever default is configured, not a hardcoded URL', async () => {
        const testConnection = sandbox.stub().resolves({success: true})
        await run(
          createAuthAddCommand(makeOptions({defaultHost: 'https://other.example.test', testConnection})),
          addWithoutHostArgv,
        )

        const config = await fs.readJSON(configFilePath())
        expect(config.profiles.default.host).to.equal('https://other.example.test')
        expect(testConnection.firstCall.args[0]).to.deep.include({host: 'https://other.example.test'})
      })

      it('still rejects an omitted -u without a defaultHost configuration', async () => {
        const testConnection = sandbox.stub().resolves({success: true})

        try {
          await run(createAuthAddCommand(makeOptions({testConnection})), addWithoutHostArgv)
          assert.fail('should have thrown')
        } catch (error) {
          expect((error as Error).message).to.include('Missing required flag host')
          expect((error as Error).message).to.not.equal('Operation canceled!')
        }

        expect(await fs.pathExists(configFilePath())).to.be.false
        expect(testConnection.called).to.be.false
      })
    })
  })

  describe('createAuthUpdateCommand', () => {
    const updateArgv = ['-p', 'default', '-t', 'newtoken', '-e', 'new@example.com']

    it('preserves the stored host when -u is omitted and defaultHost is configured', async () => {
      await fs.outputJSON(configFilePath(), {
        defaultProfile: 'default',
        profiles: {
          default: {apiToken: 'oldtoken', email: 'old@example.com', host: 'https://stored.example.com'},
          other: {apiToken: 'othertoken', host: 'https://other.example.com'},
        },
      })

      const testConnection = sandbox.stub().resolves({success: true})
      await run(
        createAuthUpdateCommand(makeOptions({defaultHost: 'https://bitbucket.org', testConnection})),
        updateArgv,
      )

      const expectedDefault = {apiToken: 'newtoken', email: 'new@example.com', host: 'https://stored.example.com'}
      const config = await fs.readJSON(configFilePath())
      expect(config.defaultProfile).to.equal('default')
      expect(config.profiles.other).to.deep.equal({apiToken: 'othertoken', host: 'https://other.example.com'})
      expect(config.profiles.default).to.deep.equal(expectedDefault)
      expect(testConnection.calledOnce).to.be.true
      expect(testConnection.firstCall.args[0]).to.deep.equal(expectedDefault)
    })

    it('falls back to the configured default when the stored profile has no host', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {apiToken: 'oldtoken', email: 'old@example.com'}},
      })

      const testConnection = sandbox.stub().resolves({success: true})
      await run(createAuthUpdateCommand(makeOptions({defaultHost: 'https://bitbucket.org', testConnection})), [
        ...updateArgv,
      ])

      const expectedDefault = {apiToken: 'newtoken', email: 'new@example.com', host: 'https://bitbucket.org'}
      const config = await fs.readJSON(configFilePath())
      expect(config.profiles.default).to.deep.equal(expectedDefault)
      expect(testConnection.calledOnce).to.be.true
      expect(testConnection.firstCall.args[0]).to.deep.equal(expectedDefault)
    })

    it('overwrites the stored host with an explicit -u', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {apiToken: 'oldtoken', host: 'https://stored.example.com'}},
      })

      const testConnection = sandbox.stub().resolves({success: true})
      await run(createAuthUpdateCommand(makeOptions({defaultHost: 'https://bitbucket.org', testConnection})), [
        ...updateArgv,
        '-u',
        'https://custom.example.test',
      ])

      const expectedDefault = {apiToken: 'newtoken', email: 'new@example.com', host: 'https://custom.example.test'}
      const config = await fs.readJSON(configFilePath())
      expect(config.profiles.default).to.deep.equal(expectedDefault)
      expect(testConnection.calledOnce).to.be.true
      expect(testConnection.firstCall.args[0]).to.deep.equal(expectedDefault)
    })

    it('still requires -u without defaultHost even when a stored host exists', async () => {
      const seeded = {
        defaultProfile: 'default',
        profiles: {default: {apiToken: 'oldtoken', host: 'https://stored.example.com'}},
      }
      await fs.outputJSON(configFilePath(), seeded)

      const testConnection = sandbox.stub().resolves({success: true})

      try {
        await run(createAuthUpdateCommand(makeOptions({testConnection})), [...updateArgv])
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.include('Missing required flag host')
        expect((error as Error).message).to.not.equal('Operation canceled!')
      }

      const config = await fs.readJSON(configFilePath())
      expect(config).to.deep.equal(seeded)
      expect(testConnection.called).to.be.false
    })
  })

  describe('auth field command factories', () => {
    it('do not mutate shared fields or factory options when creating add and update commands', () => {
      const fields: FieldDef[] = [{description: 'API Token', name: 'apiToken', required: true, type: 'string'}]
      const options = makeOptions({defaultHost: 'https://bitbucket.org', fields})

      createAuthAddCommand(options)
      createAuthUpdateCommand(options)

      expect(fields).to.deep.equal([{description: 'API Token', name: 'apiToken', required: true, type: 'string'}])
      expect(options).to.deep.equal({
        clearClients: options.clearClients,
        defaultHost: 'https://bitbucket.org',
        fields,
        serviceName: 'TestService',
        testConnection: options.testConnection,
      })
    })
  })

  describe('legacy host flag definitions', () => {
    // beforeEach pins stdout to non-TTY, matching how sibling CLIs build
    // their flags in CI: everything required.
    it('make the legacy host flag optional only when defaultHost is configured (add)', () => {
      const withDefault = createAuthAddCommand(makeOptions({defaultHost: 'https://bitbucket.org'}))
      expect(flagRequired(withDefault, 'profile')).to.be.true
      expect(flagRequired(withDefault, 'apiToken')).to.be.true
      expect(flagRequired(withDefault, 'email')).to.be.true
      expect(flagRequired(withDefault, 'host')).to.be.false

      const withoutDefault = createAuthAddCommand(makeOptions())
      expect(flagRequired(withoutDefault, 'profile')).to.be.true
      expect(flagRequired(withoutDefault, 'host')).to.be.true
    })

    it('make the legacy host flag optional only when defaultHost is configured (update)', () => {
      const withDefault = createAuthUpdateCommand(makeOptions({defaultHost: 'https://bitbucket.org'}))
      expect(flagRequired(withDefault, 'host')).to.be.false

      const withoutDefault = createAuthUpdateCommand(makeOptions())
      expect(flagRequired(withoutDefault, 'host')).to.be.true
    })
  })

  describe('interactive flag collection', () => {
    it('add uses the configured default when flags are collected without a host', async () => {
      const testConnection = sandbox.stub().resolves({success: true})
      const cls = withTtyDuring(() =>
        createAuthAddCommand(makeOptions({defaultHost: 'https://bitbucket.org', testConnection})),
      )
      // TTY definitions are all optional; the host resolution below is
      // unconditional on TTY because stdout is non-TTY while running.
      expect(flagRequired(cls, 'profile')).to.be.false
      expect(flagRequired(cls, 'host')).to.be.false

      stubParseFlags({apiToken: 'mytoken', email: 'me@example.com', profile: 'default'})
      await run(cls)

      const expected = {apiToken: 'mytoken', email: 'me@example.com', host: 'https://bitbucket.org'}
      const config = await fs.readJSON(configFilePath())
      expect(config.profiles.default).to.deep.equal(expected)
      expect(testConnection.firstCall.args[0]).to.deep.equal(expected)
    })

    it('update preserves the existing host when flags are collected without a host', async () => {
      await fs.outputJSON(configFilePath(), {
        defaultProfile: 'default',
        profiles: {default: {apiToken: 'oldtoken', email: 'old@example.com', host: 'https://stored.example.com'}},
      })

      const testConnection = sandbox.stub().resolves({success: true})
      const cls = withTtyDuring(() =>
        createAuthUpdateCommand(makeOptions({defaultHost: 'https://bitbucket.org', testConnection})),
      )

      stubParseFlags({apiToken: 'newtoken', email: 'new@example.com', profile: 'default'})
      await run(cls)

      const expected = {apiToken: 'newtoken', email: 'new@example.com', host: 'https://stored.example.com'}
      const config = await fs.readJSON(configFilePath())
      expect(config.profiles.default).to.deep.equal(expected)
      expect(testConnection.firstCall.args[0]).to.deep.equal(expected)
    })
  })

  describe('custom fields alongside defaultHost', () => {
    // PostgreSQL-shaped: `host`/`-h` and `user`/`-u` mean something else, so
    // the legacy default must not leak in and requiredness must not change.
    const customFields: FieldDef[] = [
      {char: 'h', description: 'Database host', name: 'host', required: true, type: 'string'},
      {char: 'u', description: 'Database user', name: 'user', required: true, type: 'string'},
      {char: 'w', description: 'Database password', name: 'password', required: true, type: 'string'},
    ]

    it('keeps custom host/user required for add and update', () => {
      const add = createAuthAddCommand(makeOptions({defaultHost: 'https://bitbucket.org', fields: customFields}))
      expect(flagRequired(add, 'host')).to.be.true
      expect(flagRequired(add, 'user')).to.be.true
      expect(flagRequired(add, 'password')).to.be.true

      const update = createAuthUpdateCommand(makeOptions({defaultHost: 'https://bitbucket.org', fields: customFields}))
      expect(flagRequired(update, 'host')).to.be.true
      expect(flagRequired(update, 'user')).to.be.true
    })

    it('rejects omitted custom host/user on add without injecting the legacy default', async () => {
      const testConnection = sandbox.stub().resolves({success: true})

      try {
        await run(
          createAuthAddCommand(
            makeOptions({defaultHost: 'https://bitbucket.org', fields: customFields, testConnection}),
          ),
          ['-w', 'secret'],
        )
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.include('Missing required flag host')
        expect((error as Error).message).to.include('Missing required flag user')
      }

      expect(await fs.pathExists(configFilePath())).to.be.false
      expect(testConnection.called).to.be.false
    })

    it('stores explicit custom values on add unchanged with no injected legacy fields', async () => {
      const testConnection = sandbox.stub().resolves({success: true})
      await run(
        createAuthAddCommand(makeOptions({defaultHost: 'https://bitbucket.org', fields: customFields, testConnection})),
        ['-p', 'default', '-h', 'db.example.test', '-u', 'dbuser', '-w', 'secret'],
      )

      const expected = {host: 'db.example.test', password: 'secret', user: 'dbuser'}
      const config = await fs.readJSON(configFilePath())
      expect(config.profiles.default).to.deep.equal(expected)
      expect(testConnection.calledOnce).to.be.true
      expect(testConnection.firstCall.args[0]).to.deep.equal(expected)
    })

    it('rejects omitted custom host/user on update without injecting the legacy default', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {host: 'db.example.test', password: 'old', user: 'dbuser'}},
      })

      const testConnection = sandbox.stub().resolves({success: true})

      try {
        await run(
          createAuthUpdateCommand(
            makeOptions({defaultHost: 'https://bitbucket.org', fields: customFields, testConnection}),
          ),
          ['-w', 'newsecret'],
        )
        assert.fail('should have thrown')
      } catch (error) {
        expect((error as Error).message).to.include('Missing required flag host')
        expect((error as Error).message).to.include('Missing required flag user')
      }

      const config = await fs.readJSON(configFilePath())
      expect(config.profiles.default).to.deep.equal({host: 'db.example.test', password: 'old', user: 'dbuser'})
      expect(testConnection.called).to.be.false
    })

    it('stores explicit custom values on update unchanged with no injected legacy fields', async () => {
      await fs.outputJSON(configFilePath(), {
        profiles: {default: {host: 'db.example.test', password: 'old', user: 'dbuser'}},
      })

      const testConnection = sandbox.stub().resolves({success: true})
      await run(
        createAuthUpdateCommand(
          makeOptions({defaultHost: 'https://bitbucket.org', fields: customFields, testConnection}),
        ),
        ['-p', 'default', '-h', 'db2.example.test', '-u', 'dbuser2', '-w', 'newsecret'],
      )

      const expected = {host: 'db2.example.test', password: 'newsecret', user: 'dbuser2'}
      const config = await fs.readJSON(configFilePath())
      expect(config.profiles.default).to.deep.equal(expected)
      expect(testConnection.calledOnce).to.be.true
      expect(testConnection.firstCall.args[0]).to.deep.equal(expected)
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
