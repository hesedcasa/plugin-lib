// testConnection is implemented by the consuming plugin and usually just forwards
// an HTTP client's error message verbatim. Those messages can carry an
// Authorization header, a connection string, or a token-bearing response body
// from the failed request, and the text reaches the terminal, CI logs, and
// --json output, so credential shapes are masked before it is shown.
//
// This is best-effort masking, not a guarantee: it only catches shapes it knows.
// It is not a licence to pass genuinely untrusted text through to a user.

const CENSOR = '[REDACTED]'

// A quoted value runs to its closing quote, and \\. keeps an escaped quote from
// ending it early — which would otherwise strand the rest of the credential
// outside the match. Shared by the header and parameter patterns below.
const QUOTED = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`

// scheme://user:password@host — the user is a useful diagnostic, the password
// never is. A userinfo with no colon is a bare token, so all of it goes. The
// userinfo runs to the *last* @ before the host, since a password may contain
// one; only /, ? and # can end the authority.
const URL_USERINFO_PATTERN = /\b([a-z][\w+.-]*:\/\/)([^\s/?#]*)@/gi

// Any Authorization value, whatever the scheme. An allowlist of scheme names
// would keep missing new ones (Token, HMAC-SHA256), so this takes the value as
// the up-to-two tokens a header holds — "<scheme> <credential>" or a bare
// credential — and masks the lot. Telling those two apart is guesswork
// ("Authorization: prod-secret is expired" reads the same either way), and
// guessing wrong would leave the credential in place, so the scheme is not kept.
const AUTH_HEADER_PATTERN = new RegExp(
  String.raw`(["']?)(authorization)\1(\s*[:=]\s*)(${QUOTED}|[^\s"',;]+(?:\s+[^\s"',;]+)?)`,
  'gi',
)

// A scheme and its credential can also appear with no header name in front.
// Which of those two the following word is cannot be settled by the regex, so
// the pattern casts wide and isCredentialShaped decides.
const BARE_AUTH_SCHEME_PATTERN = /\b(Bearer|Basic|Token|Digest|HMAC|Negotiate|ApiKey)\s+([^\s"',;]+)/gi

// The [\w-]* prefix lets a bare keyword match as the tail of a compound key
// (access_token, clientSecret), since \b never fires between an underscore and a
// letter. The optional quotes let the same pattern match a JSON key as well as a
// query parameter, and the value stops where a query parameter or list does.
const CREDENTIAL_PARAM_PATTERN = new RegExp(
  String.raw`(["']?)([\w-]*(?:api[_-]?key|token|secret|password|passwd|pwd|credentials?))\1(\s*[:=]\s*)(${QUOTED}|[^\s"'&,;]+)`,
  'gi',
)

// A scheme word doubles as ordinary English — "Token expired", "Basic
// authentication failed", "Digest realm=..." — so these are read as the next
// word of a sentence rather than as a credential.
const PROSE_AFTER_SCHEME = new Set([
  'auth',
  'authentication',
  'credentials',
  'empty',
  'error',
  'expired',
  'failed',
  'has',
  'header',
  'invalid',
  'is',
  'malformed',
  'missing',
  'not',
  'realm',
  'refresh',
  'rejected',
  'required',
  'revoked',
  'scope',
  'token',
  'unknown',
  'was',
])

// Credentials are long and carry a digit, a capital, or base64/URL punctuation.
// A short all-lowercase word is prose. This errs towards masking: a credential
// left in place is worse than a mangled sentence.
function isCredentialShaped(value: string): boolean {
  const word = value.replaceAll(/^\W+|\W+$/g, '').toLowerCase()
  if (PROSE_AFTER_SCHEME.has(word)) return false

  return value.length >= 6 && /[\dA-Z._~+/=-]/.test(value)
}

// Replacing a quoted value with a bare censor would leave the surrounding JSON
// or query string visibly malformed, so the quoting is put back.
function splitQuote(raw: string): {inner: string; quote: string} {
  const quote = raw.startsWith('"') ? '"' : raw.startsWith("'") ? "'" : ''
  return {inner: quote === '' ? raw : raw.slice(1, -1), quote}
}

// Only a value that is *entirely* the censor is left alone. Accepting one that
// merely contains it would let "[REDACTED]<credential>" walk straight through.
function isMasked(inner: string): boolean {
  return inner.trim() === CENSOR
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
      if (isMasked(credential) || !isCredentialShaped(credential)) return match

      return `${scheme} ${CENSOR}`
    })
    .replaceAll(CREDENTIAL_PARAM_PATTERN, (...groups: string[]) => {
      const [match, keyQuote, key, separator, raw] = groups
      const {inner, quote} = splitQuote(raw)
      if (isMasked(inner)) return match

      return `${keyQuote}${key}${keyQuote}${separator}${quote}${CENSOR}${quote}`
    })
}
