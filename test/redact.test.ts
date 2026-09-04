import {expect} from 'chai'

import {redactSecrets} from '../src/redact.js'

describe('redactSecrets', () => {
  describe('Authorization headers', () => {
    it('drops a Bearer credential', () => {
      expect(redactSecrets('upstream rejected Authorization: Bearer secret-token')).to.equal(
        'upstream rejected Authorization: [REDACTED]',
      )
    })

    it('drops the credential of a scheme it has never seen', () => {
      expect(redactSecrets('Authorization: Token prod-secret')).to.equal('Authorization: [REDACTED]')
      expect(redactSecrets('Authorization: HMAC-SHA256 abc123')).to.equal('Authorization: [REDACTED]')
    })

    it('drops a header value that carries no scheme at all', () => {
      expect(redactSecrets('Authorization: prod-secret-value')).to.equal('Authorization: [REDACTED]')
    })

    // The value is masked as a unit because "<scheme> <credential>" and
    // "<credential> <prose>" are indistinguishable; erring the other way would
    // leave the credential in place.
    it('takes a following word with it rather than risk keeping the credential', () => {
      expect(redactSecrets('Authorization: prod-secret is expired')).to.equal('Authorization: [REDACTED] expired')
    })

    it('redacts a quoted header inside a JSON body without breaking its shape', () => {
      expect(redactSecrets('{"authorization":"Bearer abc123"}')).to.equal('{"authorization":"[REDACTED]"}')
    })
  })

  describe('bare auth schemes', () => {
    it('redacts a credential-shaped token with no header name in front', () => {
      expect(redactSecrets('sent Basic YWxpY2U6c2VjcmV0 upstream')).to.equal('sent Basic [REDACTED] upstream')
    })

    it('leaves prose that happens to start with a scheme word alone', () => {
      expect(redactSecrets('Basic authentication failed')).to.equal('Basic authentication failed')
      expect(redactSecrets('Token expired')).to.equal('Token expired')
    })
  })

  describe('credential parameters', () => {
    it('redacts compound keys that a bare keyword cannot match', () => {
      expect(redactSecrets('access_token=at-value refresh_token=rt-value')).to.equal(
        'access_token=[REDACTED] refresh_token=[REDACTED]',
      )
      expect(redactSecrets('clientSecret: "cs-value"')).to.equal('clientSecret: "[REDACTED]"')
    })

    it('redacts quoted JSON keys', () => {
      expect(redactSecrets('{"access_token":"secret","expires_in":3600}')).to.equal(
        '{"access_token":"[REDACTED]","expires_in":3600}',
      )
      expect(redactSecrets("{'client_secret': 'secret'}")).to.equal("{'client_secret': '[REDACTED]'}")
    })

    it('stops at the end of the value so the rest of the query string survives', () => {
      expect(redactSecrets('GET /v1/thing?token=abc123&page=2 failed')).to.equal(
        'GET /v1/thing?token=[REDACTED]&page=2 failed',
      )
    })

    it('covers the other credential spellings', () => {
      expect(redactSecrets('password=hunter2')).to.equal('password=[REDACTED]')
      expect(redactSecrets('apiKey: "abc123"')).to.equal('apiKey: "[REDACTED]"')
      expect(redactSecrets('api_key=abc123')).to.equal('api_key=[REDACTED]')
      expect(redactSecrets('pwd=abc123')).to.equal('pwd=[REDACTED]')
      expect(redactSecrets('credentials=abc123')).to.equal('credentials=[REDACTED]')
    })
  })

  describe('URL userinfo', () => {
    it('keeps the user and drops the password', () => {
      expect(redactSecrets('connect failed: https://alice:supersecret@example.test/path')).to.equal(
        'connect failed: https://alice:[REDACTED]@example.test/path',
      )
      expect(redactSecrets('mysql://root:hunter2@db.internal:3306/app')).to.equal(
        'mysql://root:[REDACTED]@db.internal:3306/app',
      )
    })

    it('drops a userinfo that is a bare token', () => {
      expect(redactSecrets('https://ghp_secretvalue@github.test/x')).to.equal('https://[REDACTED]@github.test/x')
    })
  })

  describe('messages with nothing to hide', () => {
    it('leaves an ordinary connection error untouched', () => {
      const message = 'connect ECONNREFUSED 127.0.0.1:3306 while reaching https://db.example.test/health'
      expect(redactSecrets(message)).to.equal(message)
    })

    it('leaves an ordinary auth rejection untouched', () => {
      const message = "Access denied for user 'root'"
      expect(redactSecrets(message)).to.equal(message)
    })

    it('returns an empty string unchanged', () => {
      expect(redactSecrets('')).to.equal('')
    })
  })

  it('is idempotent, so a message is never redacted twice into nonsense', () => {
    const message = 'Authorization: Bearer abc123 for https://alice:pw@example.test?token=xyz789'
    const once = redactSecrets(message)

    expect(redactSecrets(once)).to.equal(once)
    expect(once).to.not.include('abc123')
    expect(once).to.not.include('xyz789')
  })
})
