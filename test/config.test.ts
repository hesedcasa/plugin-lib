import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {default as fs} from 'fs-extra'
import {createSandbox} from 'sinon'

import {createProfileManager} from '../src/config.js'

function makeConfig(dir = '/mock/config'): Config {
  return {bin: 'test-cli', configDir: dir} as unknown as Config
}

const configFilePath = '/mock/config/test-cli-config.json'

describe('createProfileManager', () => {
  const sandbox = createSandbox()

  afterEach(() => {
    sandbox.restore()
  })

  describe('authConfig (initial load)', () => {
    it('returns undefined when no config file exists', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      const {authConfig} = await createProfileManager(makeConfig())
      expect(authConfig).to.be.undefined
    })

    it('returns config for a named profile', async () => {
      sandbox.stub(fs, 'readJSON').resolves({
        profiles: {work: {apiToken: 'tok123', host: 'https://work.example.com'}},
      })

      const {authConfig} = await createProfileManager(makeConfig(), 'work')
      expect(authConfig).to.deep.equal({apiToken: 'tok123', host: 'https://work.example.com'})
    })

    it('returns the defaultProfile when no profile argument given', async () => {
      sandbox.stub(fs, 'readJSON').resolves({
        defaultProfile: 'work',
        profiles: {
          personal: {apiToken: 'tok456', host: 'https://personal.example.com'},
          work: {apiToken: 'tok123', host: 'https://work.example.com'},
        },
      })

      const {authConfig} = await createProfileManager(makeConfig())
      expect(authConfig).to.deep.equal({apiToken: 'tok123', host: 'https://work.example.com'})
    })

    it('falls back to the default profile when no defaultProfile key is set', async () => {
      sandbox.stub(fs, 'readJSON').resolves({
        profiles: {default: {apiToken: 'tok789', host: 'https://default.example.com'}},
      })

      const {authConfig} = await createProfileManager(makeConfig())
      expect(authConfig).to.deep.equal({apiToken: 'tok789', host: 'https://default.example.com'})
    })

    it('returns undefined for a non-default profile in old auth format', async () => {
      sandbox.stub(fs, 'readJSON').resolves({auth: {apiToken: 'tok', host: 'https://example.com'}})

      const {authConfig} = await createProfileManager(makeConfig(), 'work')
      expect(authConfig).to.be.undefined
    })

    it('returns auth from old format when using the default profile', async () => {
      sandbox.stub(fs, 'readJSON').resolves({auth: {apiToken: 'tok', host: 'https://example.com'}})

      const {authConfig} = await createProfileManager(makeConfig())
      expect(authConfig).to.deep.equal({apiToken: 'tok', host: 'https://example.com'})
    })
  })

  describe('getDefaultProfile', () => {
    it('returns "default" when no config file exists', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      const {getDefaultProfile} = await createProfileManager(makeConfig())
      expect(await getDefaultProfile()).to.equal('default')
    })

    it('returns the stored defaultProfile', async () => {
      sandbox.stub(fs, 'readJSON').resolves({defaultProfile: 'work', profiles: {}})

      const {getDefaultProfile} = await createProfileManager(makeConfig())
      expect(await getDefaultProfile()).to.equal('work')
    })

    it('returns "default" when no defaultProfile key is set', async () => {
      sandbox.stub(fs, 'readJSON').resolves({profiles: {}})

      const {getDefaultProfile} = await createProfileManager(makeConfig())
      expect(await getDefaultProfile()).to.equal('default')
    })
  })

  describe('setDefaultProfile', () => {
    it('logs error when config file does not exist', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      const {setDefaultProfile} = await createProfileManager(makeConfig())
      const logs: string[] = []
      await setDefaultProfile('work', (msg) => logs.push(msg))
      expect(logs).to.include('Missing authentication config')
    })

    it('logs error when profile is not found', async () => {
      sandbox.stub(fs, 'readJSON').resolves({profiles: {default: {apiToken: 't', host: 'h'}}})

      const {setDefaultProfile} = await createProfileManager(makeConfig())
      const logs: string[] = []
      await setDefaultProfile('nonexistent', (msg) => logs.push(msg))
      expect(logs).to.include("Profile 'nonexistent' not found")
    })

    it('writes the new defaultProfile and logs confirmation', async () => {
      const raw = {profiles: {work: {apiToken: 't', host: 'h'}}}
      sandbox.stub(fs, 'readJSON').resolves(raw)
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const {setDefaultProfile} = await createProfileManager(makeConfig())
      const logs: string[] = []
      await setDefaultProfile('work', (msg) => logs.push(msg))

      expect(outputStub.calledOnce).to.be.true
      expect(outputStub.firstCall.args[1]).to.have.property('defaultProfile', 'work')
      expect(logs).to.include("Default profile set to 'work'")
    })
  })

  describe('readProfiles', () => {
    it('returns the profiles object', async () => {
      const profiles = {work: {apiToken: 't', host: 'h'}}
      sandbox.stub(fs, 'readJSON').resolves({profiles})

      const {readProfiles} = await createProfileManager(makeConfig())
      expect(await readProfiles(() => {})).to.deep.equal(profiles)
    })

    it('converts old auth format to a default profile', async () => {
      const auth = {apiToken: 't', host: 'h'}
      sandbox.stub(fs, 'readJSON').resolves({auth})

      const {readProfiles} = await createProfileManager(makeConfig())
      expect(await readProfiles(() => {})).to.deep.equal({default: auth})
    })

    it('returns empty object when file has neither profiles nor auth', async () => {
      sandbox.stub(fs, 'readJSON').resolves({})

      const {readProfiles} = await createProfileManager(makeConfig())
      expect(await readProfiles(() => {})).to.deep.equal({})
    })

    it('returns undefined and logs error when file is missing', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      const {readProfiles} = await createProfileManager(makeConfig())
      const logs: string[] = []
      const result = await readProfiles((msg) => logs.push(msg))
      expect(result).to.be.undefined
      expect(logs).to.include('No authentication profiles found')
    })
  })

  describe('saveProfiles', () => {
    it('writes profiles to the config file', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const profiles = {work: {apiToken: 't', host: 'h'}}
      const {saveProfiles} = await createProfileManager(makeConfig())
      await saveProfiles(profiles)

      expect(outputStub.calledOnce).to.be.true
      expect(outputStub.firstCall.args[0]).to.equal(configFilePath)
      expect(outputStub.firstCall.args[1]).to.deep.include({profiles})
    })

    it('strips the old auth key when saving new profiles', async () => {
      sandbox.stub(fs, 'readJSON').resolves({auth: {apiToken: 'old', host: 'old'}})
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const {saveProfiles} = await createProfileManager(makeConfig())
      await saveProfiles({default: {apiToken: 'new', host: 'new'}})

      expect(outputStub.firstCall.args[1]).to.not.have.property('auth')
    })

    it('preserves existing keys like defaultProfile', async () => {
      sandbox.stub(fs, 'readJSON').resolves({defaultProfile: 'work', profiles: {}})
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const {saveProfiles} = await createProfileManager(makeConfig())
      await saveProfiles({work: {apiToken: 't', host: 'h'}})

      expect(outputStub.firstCall.args[1]).to.have.property('defaultProfile', 'work')
    })
  })
})
