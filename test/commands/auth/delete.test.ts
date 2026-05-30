import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('auth:delete', () => {
  it('runs auth:delete cmd', async () => {
    const {stdout} = await runCommand('auth:delete')
    expect(stdout).to.contain('hello world')
  })

  it('runs auth:delete --name oclif', async () => {
    const {stdout} = await runCommand('auth:delete --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
