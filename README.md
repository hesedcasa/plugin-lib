# jira

CLI for Jira API interaction

[![Version](https://img.shields.io/npm/v/@hesed/jira.svg)](https://npmjs.org/package/@hesed/jira)
[![Downloads/week](https://img.shields.io/npm/dw/@hesed/jira.svg)](https://npmjs.org/package/@hesed/jira)

# Install

```bash
sdkck plugins install @hesed/jira
```

<!-- toc -->
* [jira](#jira)
* [Install](#install)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->
```sh-session
$ npm install -g @hesed/plugin-lib
$ @hesed/plugin-lib COMMAND
running command...
$ @hesed/plugin-lib (--version)
@hesed/plugin-lib/0.1.0 linux-x64 node-v20.20.2
$ @hesed/plugin-lib --help [COMMAND]
USAGE
  $ @hesed/plugin-lib COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`@hesed/plugin-lib auth add`](#hesedplugin-lib-auth-add)
* [`@hesed/plugin-lib auth test`](#hesedplugin-lib-auth-test)

## `@hesed/plugin-lib auth add`

Add authentication

```
USAGE
  $ @hesed/plugin-lib auth add -t <value> -u <value> [--json] [-e <value>] [-p <value>]

FLAGS
  -e, --email=<value>    Account email
  -p, --profile=<value>  Profile name
  -t, --token=<value>    (required) API Token
  -u, --url=<value>      (required) API endpoint URL (start with https://)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Add authentication

EXAMPLES
  $ @hesed/plugin-lib auth add

  $ @hesed/plugin-lib auth add --p work
```

_See code: [src/commands/auth/add.ts](https://github.com/hesedcasa/plugin-lib/blob/v0.1.0/src/commands/auth/add.ts)_

## `@hesed/plugin-lib auth test`

Test authentication and connection

```
USAGE
  $ @hesed/plugin-lib auth test [--json] [-p <value>]

FLAGS
  -p, --profile=<value>  Authentication profile name

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Test authentication and connection

EXAMPLES
  $ @hesed/plugin-lib auth test

  $ @hesed/plugin-lib auth test --p work
```

_See code: [src/commands/auth/test.ts](https://github.com/hesedcasa/plugin-lib/blob/v0.1.0/src/commands/auth/test.ts)_
<!-- commandsstop -->
