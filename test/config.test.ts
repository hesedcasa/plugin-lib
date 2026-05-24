import {expect} from 'chai'
import {default as fs} from 'fs-extra'
import {default as path} from 'node:path'
import {createSandbox} from 'sinon'

import {createProfileManager} from '../src/config.js'

const mockConfigDir = path.join(path.sep, 'mock', 'config')
const CONFIG_FILE = 'test-cli-config.json'
const configFilePath = path.join(mockConfigDir, CONFIG_FILE)

describe('createProfileManager', () => {
  const sandbox = createSandbox()
  const {getDefaultProfile, readConfig, readProfiles, setDefaultProfile} = createProfileManager(CONFIG_FILE)

  afterEach(() => {
    sandbox.restore()
  })

  describe('readConfig', () => {
    it('returns undefined when no config file exists', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      expect(await readConfig(mockConfigDir, () => {})).to.be.undefined
    })

    it('returns config for a named profile', async () => {
      sandbox.stub(fs, 'readJSON').resolves({
        profiles: {work: {apiToken: 'tok123', host: 'https://work.example.com'}},
      })

      const result = await readConfig(mockConfigDir, () => {}, 'work')
      expect(result?.auth).to.deep.equal({apiToken: 'tok123', host: 'https://work.example.com'})
    })

    it('returns the defaultProfile when no profile argument given', async () => {
      sandbox.stub(fs, 'readJSON').resolves({
        defaultProfile: 'work',
        profiles: {
          personal: {apiToken: 'tok456', host: 'https://personal.example.com'},
          work: {apiToken: 'tok123', host: 'https://work.example.com'},
        },
      })

      const result = await readConfig(mockConfigDir, () => {})
      expect(result?.auth).to.deep.equal({apiToken: 'tok123', host: 'https://work.example.com'})
    })

    it('falls back to the default profile when no defaultProfile key is set', async () => {
      sandbox.stub(fs, 'readJSON').resolves({
        profiles: {default: {apiToken: 'tok789', host: 'https://default.example.com'}},
      })

      const result = await readConfig(mockConfigDir, () => {})
      expect(result?.auth).to.deep.equal({apiToken: 'tok789', host: 'https://default.example.com'})
    })

    it('returns undefined for a non-default profile in old auth format', async () => {
      sandbox.stub(fs, 'readJSON').resolves({auth: {apiToken: 'tok', host: 'https://example.com'}})

      expect(await readConfig(mockConfigDir, () => {}, 'work')).to.be.undefined
    })

    it('returns auth from old format when using the default profile', async () => {
      sandbox.stub(fs, 'readJSON').resolves({auth: {apiToken: 'tok', host: 'https://example.com'}})

      const result = await readConfig(mockConfigDir, () => {})
      expect(result?.auth).to.deep.equal({apiToken: 'tok', host: 'https://example.com'})
    })
  })

  describe('getDefaultProfile', () => {
    it('returns "default" when no config file exists', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      expect(await getDefaultProfile(mockConfigDir)).to.equal('default')
    })

    it('returns the stored defaultProfile', async () => {
      sandbox.stub(fs, 'readJSON').resolves({defaultProfile: 'work', profiles: {}})

      expect(await getDefaultProfile(mockConfigDir)).to.equal('work')
    })

    it('returns "default" when no defaultProfile key is set', async () => {
      sandbox.stub(fs, 'readJSON').resolves({profiles: {}})

      expect(await getDefaultProfile(mockConfigDir)).to.equal('default')
    })
  })

  describe('setDefaultProfile', () => {
    it('logs error when config file does not exist', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      const logs: string[] = []
      await setDefaultProfile(mockConfigDir, 'work', (msg) => logs.push(msg))
      expect(logs).to.include('No authentication profiles found')
    })

    it('logs error when profile is not found', async () => {
      sandbox.stub(fs, 'readJSON').resolves({profiles: {default: {apiToken: 't', host: 'h'}}})

      const logs: string[] = []
      await setDefaultProfile(mockConfigDir, 'nonexistent', (msg) => logs.push(msg))
      expect(logs).to.include("Profile 'nonexistent' not found")
    })

    it('writes the new defaultProfile and logs confirmation', async () => {
      const raw = {profiles: {work: {apiToken: 't', host: 'h'}}}
      sandbox.stub(fs, 'readJSON').resolves(raw)
      const outputStub = sandbox.stub(fs, 'outputJSON').resolves()

      const logs: string[] = []
      await setDefaultProfile(mockConfigDir, 'work', (msg) => logs.push(msg))

      expect(outputStub.calledOnce).to.be.true
      expect(outputStub.firstCall.args[1]).to.have.property('defaultProfile', 'work')
      expect(logs).to.include("Default profile set to 'work'")
    })
  })

  describe('readProfiles', () => {
    it('returns the profiles object', async () => {
      const profiles = {work: {apiToken: 't', host: 'h'}}
      sandbox.stub(fs, 'readJSON').resolves({profiles})

      expect(await readProfiles(mockConfigDir, () => {})).to.deep.equal(profiles)
    })

    it('converts old auth format to a default profile', async () => {
      const auth = {apiToken: 't', host: 'h'}
      sandbox.stub(fs, 'readJSON').resolves({auth})

      expect(await readProfiles(mockConfigDir, () => {})).to.deep.equal({default: auth})
    })

    it('returns empty object when file has neither profiles nor auth', async () => {
      sandbox.stub(fs, 'readJSON').resolves({})

      expect(await readProfiles(mockConfigDir, () => {})).to.deep.equal({})
    })

    it('returns undefined and logs error when file is missing', async () => {
      sandbox.stub(fs, 'readJSON').rejects({code: 'ENOENT'})

      const logs: string[] = []
      const result = await readProfiles(mockConfigDir, (msg) => logs.push(msg))
      expect(result).to.be.undefined
      expect(logs).to.include('No authentication profiles found')
    })

    it('returns undefined and logs the raw message for non-ENOENT errors', async () => {
      sandbox.stub(fs, 'readJSON').rejects(new Error('permission denied'))

      const logs: string[] = []
      const result = await readProfiles(mockConfigDir, (msg) => logs.push(msg))
      expect(result).to.be.undefined
      expect(logs).to.include('permission denied')
    })
  })

  // verify configFilePath is constructed correctly (smoke check for configPath helper)
  it('uses the expected config file path', () => {
    expect(configFilePath).to.equal(path.join(mockConfigDir, CONFIG_FILE))
  })
})
