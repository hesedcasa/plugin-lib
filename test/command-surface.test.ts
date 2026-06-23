import type {Command} from '@oclif/core'
import type {Config} from '@oclif/core/interfaces'

import {expect} from 'chai'

import {buildKeywords} from '../src/command-surface.js'

function makeConfig(commands: Array<Partial<Command.Loadable> & {id: string}>): Config {
  return {commands} as unknown as Config
}

describe('buildKeywords', () => {
  it('passes canonical oclif command ids to isAllowed', () => {
    const seen: string[] = []
    const keywords = buildKeywords(
      makeConfig([
        {id: 'auth:login', summary: 'Sign in'},
        {id: 'auth:logout', summary: 'Sign out'},
      ]),
      {},
      (commandId) => {
        seen.push(commandId)
        return commandId === 'auth:login'
      },
    )

    expect(seen).to.deep.equal(['auth:login', 'auth:logout'])
    expect(keywords.has('login')).to.be.true
    expect(keywords.has('logout')).to.be.false
  })
})
