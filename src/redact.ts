// testConnection is implemented by the consuming plugin and usually just forwards
// an HTTP client's error message verbatim. Those messages can carry an
// Authorization header, a connection string, or a token-bearing response body
// from the failed request, and the text reaches the terminal, CI logs, and
// --json output, so credential shapes are masked before it is shown.
//
// This is best-effort masking, not a guarantee: it only catches shapes it knows.
// It is not a licence to pass genuinely untrusted text through to a user.

const CENSOR = '[REDACTED]'

// scheme://user:password@host — the user is a useful diagnostic, the password
// never is. A userinfo with no colon is a bare token, so all of it goes.
const URL_USERINFO_PATTERN = /\b([a-z][\w+.-]*:\/\/)([^\s/?#@]*)@/gi

// Any Authorization value, whatever the scheme. An allowlist of scheme names
// would keep missing new ones (Token, HMAC-SHA256), so this takes the value as
// the up-to-two tokens a header holds — "<scheme> <credential>" or a bare
// credential — and masks the lot. Telling those two apart is guesswork
// ("Authorization: prod-secret is expired" reads the same either way), and
// guessing wrong would leave the credential in place, so the scheme is not kept.
const AUTH_HEADER_PATTERN = /(["']?)(authorization)\1(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s"',;]+(?:\s+[^\s"',;]+)?)/gi

// With no header name in front, the scheme word is the only signal, so this
// stays narrow: two unambiguous schemes followed by something credential-shaped.
// "Basic authentication failed" is prose; "Basic YWxpY2U6c2VjcmV0" is not.
const BARE_AUTH_SCHEME_PATTERN = /\b([Bb]earer|[Bb]asic)\s+((?=[^\s"',;]*[\dA-Z._~+/=-])[^\s"',;]{6,})/g

// The [\w-]* prefix lets a bare keyword match as the tail of a compound key
// (access_token, clientSecret), since \b never fires between an underscore and a
// letter. The optional quotes let the same pattern match a JSON key as well as a
// query parameter, and the bounded value leaves the rest of the object intact.
const CREDENTIAL_PARAM_PATTERN =
  /(["']?)([\w-]*(?:api[_-]?key|token|secret|password|passwd|pwd|credentials?))\1(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s"'&,;)\]}]+)/gi

// Replacing a quoted value with a bare censor would leave the surrounding JSON
// or query string visibly malformed, so the quoting is put back.
function splitQuote(raw: string): {inner: string; quote: string} {
  const quote = raw.startsWith('"') ? '"' : raw.startsWith("'") ? "'" : ''
  return {inner: quote === '' ? raw : raw.slice(1, -1), quote}
}

// A value that has already been masked is left exactly as it is, so running the
// sanitizer twice cannot chew through the censor or the text around it.
function isMasked(inner: string): boolean {
  return inner.includes('[REDACTED')
}

export function redactSecrets(text: string): string {
  return text
    .replaceAll(URL_USERINFO_PATTERN, (_match, scheme: string, userinfo: string) => {
      const separator = userinfo.indexOf(':')
      return separator === -1 ? `${scheme}${CENSOR}@` : `${scheme}${userinfo.slice(0, separator)}:${CENSOR}@`
    })
    .replaceAll(AUTH_HEADER_PATTERN, (...groups: string[]) => {
      const [match, keyQuote, key, separator, raw] = groups
      const {inner, quote} = splitQuote(raw)
      if (isMasked(inner)) return match

      return `${keyQuote}${key}${keyQuote}${separator}${quote}${CENSOR}${quote}`
    })
    .replaceAll(BARE_AUTH_SCHEME_PATTERN, (...groups: string[]) => {
      const [match, scheme, credential] = groups
      return isMasked(credential) ? match : `${scheme} ${CENSOR}`
    })
    .replaceAll(CREDENTIAL_PARAM_PATTERN, (...groups: string[]) => {
      const [match, keyQuote, key, separator, raw] = groups
      const {inner, quote} = splitQuote(raw)
      if (isMasked(inner)) return match

      return `${keyQuote}${key}${keyQuote}${separator}${quote}${CENSOR}${quote}`
    })
}
