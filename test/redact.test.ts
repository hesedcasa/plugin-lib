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

    it('takes a quoted credential with the scheme in front of it', () => {
      expect(redactSecrets('Authorization: Token "abcdef"')).to.equal('Authorization: [REDACTED]')
    })
  })

  describe('bare auth schemes', () => {
    it('redacts a credential-shaped token with no header name in front', () => {
      expect(redactSecrets('sent Basic YWxpY2U6c2VjcmV0 upstream')).to.equal('sent Basic [REDACTED] upstream')
    })

    it('redacts schemes beyond Bearer and Basic', () => {
      expect(redactSecrets('upstream rejected Token prod-secret')).to.equal('upstream rejected Token [REDACTED]')
      expect(redactSecrets('Negotiate YII5gAYGKwYBBQUC')).to.equal('Negotiate [REDACTED]')
    })

    it('redacts a quoted credential without breaking its quoting', () => {
      expect(redactSecrets('Token "abcdef"')).to.equal('Token "[REDACTED]"')
      expect(redactSecrets("Token 'abcdef'")).to.equal("Token '[REDACTED]'")
    })

    // A lowercase-only credential carries no digit, capital or base64
    // punctuation to tell it apart from a word, so length and the prose list
    // are all there is to go on.
    it('redacts a credential that is all lowercase letters', () => {
      expect(redactSecrets('upstream rejected Token abcdefgh')).to.equal('upstream rejected Token [REDACTED]')
      expect(redactSecrets('Bearer abcdefgh')).to.equal('Bearer [REDACTED]')
    })

    it('leaves prose that happens to start with a scheme word alone', () => {
      expect(redactSecrets('Basic authentication failed')).to.equal('Basic authentication failed')
      expect(redactSecrets('Token expired')).to.equal('Token expired')
      expect(redactSecrets('Token expired.')).to.equal('Token expired.')
      expect(redactSecrets('Token is invalid')).to.equal('Token is invalid')
      expect(redactSecrets('Digest realm="api"')).to.equal('Digest realm="api"')
      expect(redactSecrets('Bearer tokens are not supported')).to.equal('Bearer tokens are not supported')
      expect(redactSecrets('HMAC signature mismatch')).to.equal('HMAC signature mismatch')
    })
  })

  describe('values that try to slip past the sanitizer', () => {
    it('does not let an escaped quote end a credential value early', () => {
      expect(redactSecrets(String.raw`{"token":"prefix\"live-secret"}`)).to.equal('{"token":"[REDACTED]"}')
    })

    it('does not treat a partially masked value as already safe', () => {
      expect(redactSecrets('token=[REDACTED]live-secret')).to.equal('token=[REDACTED]')
    })

    it('reads userinfo to the last @, so an @ in the password cannot split it', () => {
      expect(redactSecrets('https://alice:pa@ss@example.test/path')).to.equal(
        'https://alice:[REDACTED]@example.test/path',
      )
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

  // Masked values are recognised only when they are *entirely* the censor, so a
  // second pass can still trim a word from an unquoted header value. What has to
  // hold is that re-running never un-masks anything, not byte equality.
  it('stays masked when run over its own output', () => {
    const message = 'Authorization: Bearer abc123 for https://alice:pw@example.test?token=xyz789'
    const once = redactSecrets(message)
    const twice = redactSecrets(once)

    for (const output of [once, twice]) {
      expect(output).to.not.include('abc123')
      expect(output).to.not.include('xyz789')
      expect(output).to.include('[REDACTED]')
    }

    expect(twice).to.not.include('[REDACTED][REDACTED]')
  })
})
