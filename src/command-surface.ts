import type {Command} from '@oclif/core'
import type {Config} from '@oclif/core/interfaces'

/** Variables available to oclif's lodash-style metadata templates. */
export interface TemplateVars {
  command?: Command.Loadable | {id?: string}
  config: Config
}

/**
 * Resolve oclif's lodash-style template syntax in a metadata string, e.g.
 * `<%= config.bin %>`, `<%= command.id %>`, `<%= config.version %>`. Unknown
 * keys resolve to an empty string, matching oclif's own rendering.
 */
export function interpolateTemplate(template: string, vars: TemplateVars): string {
  return template.replaceAll(/<%=\s*([\w.]+)\s*%>/g, (_, key: string) => {
    const parts = key.split('.')
    let value: unknown = vars
    for (const part of parts) {
      value = (value as Record<string, unknown> | undefined)?.[part]
    }

    return value !== null && value !== undefined ? String(value) : ''
  })
}

function withTemplates(command: Command.Loadable, config: Config): Command.Loadable {
  const vars: TemplateVars = {command, config}
  return {
    ...command,
    description:
      typeof command.description === 'string' ? interpolateTemplate(command.description, vars) : command.description,
    summary: typeof command.summary === 'string' ? interpolateTemplate(command.summary, vars) : command.summary,
  }
}

/**
 * Return the commands that are visible and active, mirroring the filtering from
 * `@oclif/plugin-commands`: omits hidden commands, deprecated commands, and
 * deprecated aliases of other commands. Template strings in `description` and
 * `summary` are resolved.
 *
 * Reads `config.commands` directly, so when invoked from a command that
 * preserves the host Config (see `HostConfigCommand`) it includes dynamically
 * registered commands.
 */
export function listCommands(config: Config): Command.Loadable[] {
  let commands = config.commands.filter((c) => !c.hidden)

  const deprecatedAliases = new Set(commands.filter((c) => c.deprecateAliases).flatMap((c) => c.aliases ?? []))
  commands = commands.filter((c) => c.state !== 'deprecated' && !deprecatedAliases.has(c.id))

  return commands.map((c) => withTemplates(c, config))
}

const STOPWORDS = new Set([
  'a',
  'all',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'belong',
  'bin',
  'by',
  'can',
  'current',
  'different',
  'display',
  'displays',
  'for',
  'from',
  'get',
  'has',
  'have',
  'hello',
  'in',
  'into',
  'is',
  'it',
  'its',
  'level',
  'new',
  'of',
  'on',
  'or',
  'over',
  'performed',
  'performs',
  'run',
  'set',
  'show',
  'specific',
  'that',
  'the',
  'their',
  'this',
  'to',
  'use',
  'used',
  'useful',
  'uses',
  'using',
  'will',
  'with',
  'work',
  'you',
])

/**
 * Build a set of search keywords from the active commands and JIT plugin names.
 * Command ids, summaries, and descriptions are tokenized; stopwords and tokens
 * shorter than two characters are dropped.
 *
 * `isAllowed` filters which commands contribute keywords (e.g. a permission
 * check); it defaults to allowing every command, keeping this module free of
 * any permission dependency.
 */
export function buildKeywords(
  config: Config,
  jitPlugins: Record<string, string> = {},
  isAllowed: (commandId: string) => boolean = () => true,
): Set<string> {
  const keywords = new Set<string>()

  const addWord = (raw: string) => {
    const word = raw.toLowerCase().replaceAll(/^-+|-+$/g, '')
    if (word.length >= 2 && !STOPWORDS.has(word)) keywords.add(word)
  }

  for (const c of listCommands(config)) {
    if (!isAllowed(c.id.replaceAll(':', ' '))) continue
    for (const part of c.id.split(':')) addWord(part)
    const text = `${c.summary ?? ''} ${c.description ?? ''}`
    for (const raw of text.split(/[^a-zA-Z0-9-]+/)) addWord(raw)
  }

  for (const name of Object.keys(jitPlugins)) {
    const short = name.split('/').pop()
    if (short) addWord(short)
  }

  return keywords
}

interface TopicRecord {
  description?: string
  name: string
}

interface CommandRecord {
  id: string
}

/**
 * Init hooks can register commands after oclif has built its private topic
 * index. Help and topic resolution read that index rather than deriving topics
 * from `config.commands`, so rebuild the missing command prefixes (and restore
 * canonical ids/names that the help formatter rewrites in place) before relying
 * on it.
 */
export function refreshInferredTopics(config: Config): void {
  const internals = config as unknown as {
    _commands?: Map<string, CommandRecord>
    _topics?: Map<string, TopicRecord>
  }
  const topics = internals._topics
  if (!topics || !Array.isArray(config.commands)) return

  for (const [id, command] of internals._commands ?? []) command.id = id

  for (const command of config.commands) {
    if (command.hidden) continue

    const parts = command.id.split(':')
    while (parts.length > 0) {
      const name = parts.join(':')
      const existing = topics.get(name)
      if (existing) {
        existing.name = name
      } else {
        topics.set(name, {description: command.summary ?? command.description, name})
      }

      parts.pop()
    }
  }
}
