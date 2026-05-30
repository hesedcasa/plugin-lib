import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('pgauth:add', () => {
  it('runs pgauth:add cmd', async () => {
    const {stdout} = await runCommand('pgauth:add')
    expect(stdout).to.contain('hello world')
  })

  it('runs pgauth:add --name oclif', async () => {
    const {stdout} = await runCommand('pgauth:add --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
