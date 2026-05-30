import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('pgauth:test', () => {
  it('runs pgauth:test cmd', async () => {
    const {stdout} = await runCommand('pgauth:test')
    expect(stdout).to.contain('hello world')
  })

  it('runs pgauth:test --name oclif', async () => {
    const {stdout} = await runCommand('pgauth:test --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
