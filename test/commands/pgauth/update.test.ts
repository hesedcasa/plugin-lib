import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('pgauth:update', () => {
  it('runs pgauth:update cmd', async () => {
    const {stdout} = await runCommand('pgauth:update')
    expect(stdout).to.contain('hello world')
  })

  it('runs pgauth:update --name oclif', async () => {
    const {stdout} = await runCommand('pgauth:update --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
