import type {Config} from '@oclif/core'
import type {LoadOptions} from '@oclif/core/interfaces'

import {Command} from '@oclif/core'

/**
 * Base command that preserves the host CLI's already-initialized Config.
 *
 * A plugin's `@oclif/core` is frequently a different installation than the host
 * CLI's (user-installed plugins live in their own dependency tree). When such a
 * command is dispatched, oclif's default `Command.run` calls
 * `Config.load(hostConfig)`, which takes the "reload" branch: it rebuilds a
 * fresh Config from the registered plugin list and discards any commands that
 * were registered dynamically at startup — e.g. the `context7` commands from
 * api2cli or the `figma` commands from mcp-client, which the host injects into
 * the Config's command map rather than through a plugin. A command that then
 * enumerates `this.config.commands` sees only the statically installed commands.
 *
 * Extending this class instead of `Command` keeps the host's Config — and every
 * dynamically registered command on it — intact, because it skips `Config.load`
 * entirely when a live Config was handed in.
 */
export abstract class HostConfigCommand extends Command {
  static async run<T extends Command>(
    this: new (argv: string[], config: Config) => T,
    argv: string[] = [],
    options?: LoadOptions,
  ): Promise<ReturnType<T['run']>> {
    // A live Config exposes `runCommand`; the other `LoadOptions` shapes (a
    // file path/URL string or an options object) do not. When we were handed a
    // Config, instantiate against it directly instead of reloading.
    if (options && typeof options !== 'string' && 'runCommand' in options) {
      const command = new this(argv, options as Config)
      return (command as unknown as {_run(): Promise<ReturnType<T['run']>>})._run()
    }

    return super.run(argv, options) as Promise<ReturnType<T['run']>>
  }
}
