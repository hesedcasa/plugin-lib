import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('auth:add', () => {
  it('runs auth:add cmd', async () => {
    const {stdout} = await runCommand('auth:add')
    expect(stdout).to.contain('hello world')
  })

  it('runs auth:add --name oclif', async () => {
    const {stdout} = await runCommand('auth:add --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
