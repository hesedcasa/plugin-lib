import type {Hook} from '@oclif/core'

/**
 * Find the placeholder in the Config's internal `_topics` and replace it with config.bin
 * Ensure all the commands in the placeholder are correctly named
 */
const hook: Hook<'init'> = async function (opts) {
  try {
    const PLACEHOLDER = 'placeholder'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = opts.config as any

    const {bin} = opts.config

    const topics: Map<string, {description?: string; hidden?: boolean; name: string}> = config._topics
    for (const [key, topic] of topics) {
      if (key === PLACEHOLDER || key.startsWith(`${PLACEHOLDER}:`)) {
        topics.delete(key)
        const newName = key.replace(PLACEHOLDER, bin)
        topics.set(newName, {...topic, name: newName})
      }
    }

    const commands: Map<string, {[key: string]: unknown; id: string}> = config._commands
    for (const [key, command] of commands) {
      if (key.startsWith(`${PLACEHOLDER}:`)) {
        commands.delete(key)
        const newId = key.replace(PLACEHOLDER, bin)
        commands.set(newId, {...command, id: newId})
      }
    }

    // Invalidate cached commandIDs so it is recomputed from the updated _commands
    config._commandIDs = null
  } catch {
    // silently ignore — a broken hook must not prevent the CLI from starting
  }
}

export default hook
