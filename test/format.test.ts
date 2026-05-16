import {expect} from 'chai'

import {formatAsToon} from '../src/format.js'

describe('formatAsToon', () => {
  it('returns empty string for null', () => {
    expect(formatAsToon(null)).to.equal('')
  })

  it('returns empty string for undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(formatAsToon(undefined)).to.equal('')
  })

  it('returns empty string for empty string', () => {
    expect(formatAsToon('')).to.equal('')
  })

  it('returns empty string for 0', () => {
    expect(formatAsToon(0)).to.equal('')
  })

  it('returns empty string for false', () => {
    expect(formatAsToon(false)).to.equal('')
  })

  it('encodes an object', () => {
    const result = formatAsToon({name: 'alice'})
    expect(result).to.be.a('string').and.include('alice')
  })

  it('encodes a string', () => {
    expect(formatAsToon('hello')).to.be.a('string').and.have.length.greaterThan(0)
  })

  it('encodes an array', () => {
    expect(formatAsToon([1, 2, 3]))
      .to.be.a('string')
      .and.have.length.greaterThan(0)
  })

  it('encodes a truthy number', () => {
    expect(formatAsToon(42)).to.be.a('string').and.have.length.greaterThan(0)
  })
})
