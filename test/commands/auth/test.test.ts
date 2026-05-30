import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('auth:test', () => {
  it('runs auth:test cmd', async () => {
    const {stdout} = await runCommand('auth:test')
    expect(stdout).to.contain('hello world')
  })

  it('runs auth:test --name oclif', async () => {
    const {stdout} = await runCommand('auth:test --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
