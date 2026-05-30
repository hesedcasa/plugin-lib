import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {default as fs} from 'fs-extra'
import {default as path} from 'node:path'
import {createSandbox} from 'sinon'

import {createProfileManager} from '../src/config.js'

const mockConfigDir = path.join(path.sep, 'mock', 'config')

function makeConfig(dir = mockConfigDir): Config {
  return {bin: 'test-cli', configDir: dir} as unknown as Config
}

const configFilePath = path.join(mockConfigDir, 'test-cli-config.json')

describe('createProfileManager', () => {
  const sandbox = createSandbox()

  afterEach(() => {
    sandbox.restore()
  })

  describe('loadAuthConfig', () => {
    it('returns undefined when no config file exists', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      expect(await createProfileManager(makeConfig()).loadAuthConfig()).to.be.undefined
    })

    it('returns config for a named profile', async () => {
      sandbox.stub(fs, 'readJSON').resolves({
        profiles: {work: {apiToken: 'tok123', host: 'https://work.example.com'}},
      })

      expect(await createProfileManager(makeConfig(), 'work').loadAuthConfig()).to.deep.equal({
        apiToken: 'tok123',
        host: 'https://work.example.com',
      })
    })

    it('returns the defaultProfile when no profile argument given', async () => {
      sandbox.stub(fs, 'readJSON').resolves({
        defaultProfile: 'work',
        profiles: {
          personal: {apiToken: 'tok456', host: 'https://personal.example.com'},
          work: {apiToken: 'tok123', host: 'https://work.example.com'},
        },
      })

      expect(await createProfileManager(makeConfig()).loadAuthConfig()).to.deep.equal({
        apiToken: 'tok123',
        host: 'https://work.example.com',
      })
    })

    it('falls back to the default profile when no defaultProfile key is set', async () => {
      sandbox.stub(fs, 'readJSON').resolves({
        profiles: {default: {apiToken: 'tok789', host: 'https://default.example.com'}},
      })

      expect(await createProfileManager(makeConfig()).loadAuthConfig()).to.deep.equal({
        apiToken: 'tok789',
        host: 'https://default.example.com',
      })
    })

    it('returns undefined for a non-default profile in old auth format', async () => {
      sandbox.stub(fs, 'readJSON').resolves({auth: {apiToken: 'tok', host: 'https://example.com'}})

      expect(await createProfileManager(makeConfig(), 'work').loadAuthConfig()).to.be.undefined
    })

    it('returns auth from old format when using the default profile', async () => {
      sandbox.stub(fs, 'readJSON').resolves({auth: {apiToken: 'tok', host: 'https://example.com'}})

      expect(await createProfileManager(makeConfig()).loadAuthConfig()).to.deep.equal({
        apiToken: 'tok',
        host: 'https://example.com',
      })
    })
  })

  describe('getDefaultProfile', () => {
    it('throws when no config file exists', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      const {getDefaultProfile} = createProfileManager(makeConfig())
      try {
        await getDefaultProfile()
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('Missing authentication config')
      }
    })

    it('returns the stored defaultProfile', async () => {
      sandbox.stub(fs, 'readJSON').resolves({defaultProfile: 'work', profiles: {}})

      const {getDefaultProfile} = createProfileManager(makeConfig())
      expect(await getDefaultProfile()).to.equal('work')
    })

    it('returns "default" when no defaultProfile key is set', async () => {
      sandbox.stub(fs, 'readJSON').resolves({profiles: {}})

      const {getDefaultProfile} = createProfileManager(makeConfig())
      expect(await getDefaultProfile()).to.equal('default')
    })
  })

  describe('setDefaultProfile', () => {
    it('throws when config file does not exist', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      const {setDefaultProfile} = createProfileManager(makeConfig())
      try {
        await setDefaultProfile('work')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('Missing authentication config')
      }
    })

    it('throws when profile is not found', async () => {
      sandbox.stub(fs, 'readJSON').resolves({profiles: {default: {apiToken: 't', host: 'h'}}})

      const {setDefaultProfile} = createProfileManager(makeConfig())
      try {
        await setDefaultProfile('nonexistent')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include("Profile 'nonexistent' not found")
      }
    })

    it('throws when profile is not found in legacy auth format', async () => {
      sandbox.stub(fs, 'readJSON').resolves({auth: {apiToken: 't', host: 'h'}})

      const {setDefaultProfile} = createProfileManager(makeConfig())
      try {
        await setDefaultProfile('work')
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include("Profile 'work' not found")
      }
    })

    it('writes the new defaultProfile', async () => {
      const raw = {profiles: {work: {apiToken: 't', host: 'h'}}}
      sandbox.stub(fs, 'readJSON').resolves(raw)
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const {setDefaultProfile} = createProfileManager(makeConfig())
      await setDefaultProfile('work')

      expect(outputStub.calledOnce).to.be.true
      expect(outputStub.firstCall.args[1]).to.have.property('defaultProfile', 'work')
    })
  })

  describe('readProfiles', () => {
    it('returns the profiles object', async () => {
      const profiles = {work: {apiToken: 't', host: 'h'}}
      sandbox.stub(fs, 'readJSON').resolves({profiles})

      const {readProfiles} = createProfileManager(makeConfig())
      expect(await readProfiles()).to.deep.equal(profiles)
    })

    it('converts old auth format to a default profile', async () => {
      const auth = {apiToken: 't', host: 'h'}
      sandbox.stub(fs, 'readJSON').resolves({auth})

      const {readProfiles} = createProfileManager(makeConfig())
      expect(await readProfiles()).to.deep.equal({default: auth})
    })

    it('returns empty object when file has neither profiles nor auth', async () => {
      sandbox.stub(fs, 'readJSON').resolves({})

      const {readProfiles} = createProfileManager(makeConfig())
      expect(await readProfiles()).to.deep.equal({})
    })

    it('throws when file is missing', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      const {readProfiles} = createProfileManager(makeConfig())
      try {
        await readProfiles()
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error instanceof Error ? error.message : String(error)).to.include('No authentication profiles found')
      }
    })
  })

  describe('saveProfiles', () => {
    it('writes profiles to the config file', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const profiles = {work: {apiToken: 't', host: 'h'}}
      const {saveProfiles} = createProfileManager(makeConfig())
      await saveProfiles(profiles)

      expect(outputStub.calledOnce).to.be.true
      expect(outputStub.firstCall.args[0]).to.equal(configFilePath)
      expect(outputStub.firstCall.args[1]).to.deep.include({profiles})
    })

    it('strips the old auth key when saving new profiles', async () => {
      sandbox.stub(fs, 'readJSON').resolves({auth: {apiToken: 'old', host: 'old'}})
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const {saveProfiles} = createProfileManager(makeConfig())
      await saveProfiles({default: {apiToken: 'new', host: 'new'}})

      expect(outputStub.firstCall.args[1]).to.not.have.property('auth')
    })

    it('preserves existing keys like defaultProfile', async () => {
      sandbox.stub(fs, 'readJSON').resolves({defaultProfile: 'work', profiles: {}})
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const {saveProfiles} = createProfileManager(makeConfig())
      await saveProfiles({work: {apiToken: 't', host: 'h'}})

      expect(outputStub.firstCall.args[1]).to.have.property('defaultProfile', 'work')
    })
  })

  describe('clearDefaultProfile', () => {
    it('removes the defaultProfile key from config', async () => {
      sandbox.stub(fs, 'readJSON').resolves({defaultProfile: 'work', profiles: {work: {apiToken: 't', host: 'h'}}})
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const {clearDefaultProfile} = createProfileManager(makeConfig())
      await clearDefaultProfile()

      expect(outputStub.calledOnce).to.be.true
      expect(outputStub.firstCall.args[1]).to.not.have.property('defaultProfile')
    })

    it('preserves other config keys', async () => {
      sandbox.stub(fs, 'readJSON').resolves({defaultProfile: 'work', profiles: {work: {apiToken: 't', host: 'h'}}})
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const {clearDefaultProfile} = createProfileManager(makeConfig())
      await clearDefaultProfile()

      expect(outputStub.firstCall.args[1]).to.have.property('profiles')
    })

    it('handles missing config file', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const {clearDefaultProfile} = createProfileManager(makeConfig())
      await clearDefaultProfile()

      expect(outputStub.calledOnce).to.be.true
      expect(outputStub.firstCall.args[1]).to.deep.equal({})
    })
  })
})
