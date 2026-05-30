import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('pgauth:profile', () => {
  it('runs pgauth:profile cmd', async () => {
    const {stdout} = await runCommand('pgauth:profile')
    expect(stdout).to.contain('hello world')
  })

  it('runs pgauth:profile --name oclif', async () => {
    const {stdout} = await runCommand('pgauth:profile --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
