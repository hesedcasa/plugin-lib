import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('auth:update', () => {
  it('runs auth:update cmd', async () => {
    const {stdout} = await runCommand('auth:update')
    expect(stdout).to.contain('hello world')
  })

  it('runs auth:update --name oclif', async () => {
    const {stdout} = await runCommand('auth:update --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
