import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('pgauth:list', () => {
  it('runs pgauth:list cmd', async () => {
    const {stdout} = await runCommand('pgauth:list')
    expect(stdout).to.contain('hello world')
  })

  it('runs pgauth:list --name oclif', async () => {
    const {stdout} = await runCommand('pgauth:list --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
