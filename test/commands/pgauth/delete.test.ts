import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('pgauth:delete', () => {
  it('runs pgauth:delete cmd', async () => {
    const {stdout} = await runCommand('pgauth:delete')
    expect(stdout).to.contain('hello world')
  })

  it('runs pgauth:delete --name oclif', async () => {
    const {stdout} = await runCommand('pgauth:delete --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
