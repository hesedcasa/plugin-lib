import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('auth:list', () => {
  it('runs auth:list cmd', async () => {
    const {stdout} = await runCommand('auth:list')
    expect(stdout).to.contain('hello world')
  })

  it('runs auth:list --name oclif', async () => {
    const {stdout} = await runCommand('auth:list --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
