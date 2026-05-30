import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('auth:profile', () => {
  it('runs auth:profile cmd', async () => {
    const {stdout} = await runCommand('auth:profile')
    expect(stdout).to.contain('hello world')
  })

  it('runs auth:profile --name oclif', async () => {
    const {stdout} = await runCommand('auth:profile --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
