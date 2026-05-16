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
$ npm install -g @hesed/jira
$ jira COMMAND
running command...
$ jira (--version)
@hesed/jira/0.8.0 linux-x64 node-v20.20.2
$ jira --help [COMMAND]
USAGE
  $ jira COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`jira jira auth add`](#jira-jira-auth-add)
* [`jira jira auth list`](#jira-jira-auth-list)
* [`jira jira auth profile`](#jira-jira-auth-profile)
* [`jira jira auth test`](#jira-jira-auth-test)
* [`jira jira auth update`](#jira-jira-auth-update)
* [`jira jira board backlogs BOARDID [JQL]`](#jira-jira-board-backlogs-boardid-jql)
* [`jira jira board list [PROJECTID]`](#jira-jira-board-list-projectid)
* [`jira jira board sprint-issues BOARDID SPRINTID [JQL]`](#jira-jira-board-sprint-issues-boardid-sprintid-jql)
* [`jira jira board sprints BOARDID`](#jira-jira-board-sprints-boardid)
* [`jira jira board versions BOARDID`](#jira-jira-board-versions-boardid)
* [`jira jira issue assign ISSUEID ACCOUNTID`](#jira-jira-issue-assign-issueid-accountid)
* [`jira jira issue attachment ISSUEID FILE`](#jira-jira-issue-attachment-issueid-file)
* [`jira jira issue attachment-download ISSUEID ATTACHMENTID [OUTPUTPATH]`](#jira-jira-issue-attachment-download-issueid-attachmentid-outputpath)
* [`jira jira issue comment ISSUEID BODY`](#jira-jira-issue-comment-issueid-body)
* [`jira jira issue comment-delete ISSUEID ID`](#jira-jira-issue-comment-delete-issueid-id)
* [`jira jira issue comment-update ISSUEID ID BODY`](#jira-jira-issue-comment-update-issueid-id-body)
* [`jira jira issue create`](#jira-jira-issue-create)
* [`jira jira issue delete ISSUEID`](#jira-jira-issue-delete-issueid)
* [`jira jira issue dev ISSUEID`](#jira-jira-issue-dev-issueid)
* [`jira jira issue get ISSUEID`](#jira-jira-issue-get-issueid)
* [`jira jira issue search JQL`](#jira-jira-issue-search-jql)
* [`jira jira issue transition ISSUEID TRANSITIONID`](#jira-jira-issue-transition-issueid-transitionid)
* [`jira jira issue transitions ISSUEID`](#jira-jira-issue-transitions-issueid)
* [`jira jira issue update ISSUEID`](#jira-jira-issue-update-issueid)
* [`jira jira issue worklog ISSUEID STARTED TIMESPENT [COMMENT]`](#jira-jira-issue-worklog-issueid-started-timespent-comment)
* [`jira jira issue worklog-delete ISSUEID ID`](#jira-jira-issue-worklog-delete-issueid-id)
* [`jira jira issue worklogs ISSUEID`](#jira-jira-issue-worklogs-issueid)
* [`jira jira project get PROJECTID`](#jira-jira-project-get-projectid)
* [`jira jira project list`](#jira-jira-project-list)
* [`jira jira user get [ACCOUNTID]`](#jira-jira-user-get-accountid)
* [`jira jira user list-assignable ISSUEID`](#jira-jira-user-list-assignable-issueid)

## `jira jira auth add`

Add Atlassian authentication

```
USAGE
  $ jira jira auth add -t <value> -u <value> [--json] [-e <value>] [-p <value>]

FLAGS
  -e, --email=<value>    Account email
  -p, --profile=<value>  Profile name
  -t, --token=<value>    (required) API Token
  -u, --url=<value>      (required) Atlassian URL (start with https://)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Add Atlassian authentication

EXAMPLES
  $ jira jira auth add

  $ jira jira auth add --profile work
```

_See code: [src/commands/jira/auth/add.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/auth/add.ts)_

## `jira jira auth list`

List authentication profiles

```
USAGE
  $ jira jira auth list [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List authentication profiles

EXAMPLES
  $ jira jira auth list
```

_See code: [src/commands/jira/auth/list.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/auth/list.ts)_

## `jira jira auth profile`

Set or show the default authentication profile

```
USAGE
  $ jira jira auth profile [--json] [--default <value>]

FLAGS
  --default=<value>  Profile name to set as default

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Set or show the default authentication profile

EXAMPLES
  $ jira jira auth profile

  $ jira jira auth profile --default work
```

_See code: [src/commands/jira/auth/profile.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/auth/profile.ts)_

## `jira jira auth test`

Test authentication and connection

```
USAGE
  $ jira jira auth test [--json] [-p <value>]

FLAGS
  -p, --profile=<value>  Authentication profile name

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Test authentication and connection

EXAMPLES
  $ jira jira auth test

  $ jira jira auth test --profile work
```

_See code: [src/commands/jira/auth/test.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/auth/test.ts)_

## `jira jira auth update`

Update existing authentication profile

```
USAGE
  $ jira jira auth update -t <value> -u <value> [--json] [-e <value>] [-p <value>]

FLAGS
  -e, --email=<value>    Account email
  -p, --profile=<value>  Profile name to update (default: "default")
  -t, --token=<value>    (required) API Token
  -u, --url=<value>      (required) Atlassian instance URL (start with https://)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Update existing authentication profile

EXAMPLES
  $ jira jira auth update

  $ jira jira auth update --profile work
```

_See code: [src/commands/jira/auth/update.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/auth/update.ts)_

## `jira jira board backlogs BOARDID [JQL]`

Get all issues from the board's backlog

```
USAGE
  $ jira jira board backlogs BOARDID [JQL] [--fields <value>] [--max <value>] [-p <value>] [--start <value>] [--toon]

ARGUMENTS
  BOARDID  Board ID
  [JQL]    JQL expression

FLAGS
  -p, --profile=<value>  Authentication profile name
      --fields=<value>   Extra list of fields to return
      --max=<value>      Maximum number of items per page
      --start=<value>    Index of the first item to return
      --toon             Format output as toon

DESCRIPTION
  Get all issues from the board's backlog

EXAMPLES
  $ jira jira board backlogs 123 'summary ~ "Error saving file" AND status IN ("ready", "in progress")'

  $ jira jira board backlogs 123 'assignee="john@email.com" AND type=Bug' --max 5 --start 2

  $ jira jira board backlogs 123 'timeestimate > 4h' --fields comment,creator,timeestimate
```

_See code: [src/commands/jira/board/backlogs.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/board/backlogs.ts)_

## `jira jira board list [PROJECTID]`

Get all boards

```
USAGE
  $ jira jira board list [PROJECTID] [--max <value>] [-p <value>] [--start <value>] [--toon]

ARGUMENTS
  [PROJECTID]  Project ID or project key

FLAGS
  -p, --profile=<value>  Authentication profile name
      --max=<value>      Maximum number of items per page
      --start=<value>    Index of the first item to return
      --toon             Format output as toon

DESCRIPTION
  Get all boards

EXAMPLES
  $ jira jira board list

  $ jira jira board list PROJ
```

_See code: [src/commands/jira/board/list.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/board/list.ts)_

## `jira jira board sprint-issues BOARDID SPRINTID [JQL]`

Get all issues belong to the sprint from the board

```
USAGE
  $ jira jira board sprint-issues BOARDID SPRINTID [JQL] [--fields <value>] [--max <value>] [-p <value>] [--start <value>]
    [--toon]

ARGUMENTS
  BOARDID   Board ID
  SPRINTID  Sprint ID
  [JQL]     JQL expression

FLAGS
  -p, --profile=<value>  Authentication profile name
      --fields=<value>   Extra list of fields to return
      --max=<value>      Maximum number of items per page
      --start=<value>    Index of the first item to return
      --toon             Format output as toon

DESCRIPTION
  Get all issues belong to the sprint from the board

EXAMPLES
  $ jira jira board sprint-issues 123 3068 'summary ~ "Error saving file" AND status IN ("ready", "in progress")'

  $ jira jira board sprint-issues 123 3068 'assignee="john@email.com" AND type=Bug' --max 5 --start 2

  $ jira jira board sprint-issues 123 3068 'timeestimate > 4h' --fields comment,creator,timeestimate
```

_See code: [src/commands/jira/board/sprint-issues.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/board/sprint-issues.ts)_

## `jira jira board sprints BOARDID`

Get all sprints from a board

```
USAGE
  $ jira jira board sprints BOARDID [--max <value>] [-p <value>] [--start <value>] [--state <value>] [--toon]

ARGUMENTS
  BOARDID  Board ID

FLAGS
  -p, --profile=<value>  Authentication profile name
      --max=<value>      Maximum number of items per page
      --start=<value>    Index of the first item to return
      --state=<value>    Filters sprints in specified states (future, active, closed)
      --toon             Format output as toon

DESCRIPTION
  Get all sprints from a board

EXAMPLES
  $ jira jira board sprints 123

  $ jira jira board sprints 123 --state active
```

_See code: [src/commands/jira/board/sprints.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/board/sprints.ts)_

## `jira jira board versions BOARDID`

Get all sprints from a board

```
USAGE
  $ jira jira board versions BOARDID [--max <value>] [-p <value>] [--released <value>] [--start <value>] [--toon]

ARGUMENTS
  BOARDID  Board ID

FLAGS
  -p, --profile=<value>   Authentication profile name
      --max=<value>       Maximum number of items per page
      --released=<value>  Filters versions release state (true, false)
      --start=<value>     Index of the first item to return
      --toon              Format output as toon

DESCRIPTION
  Get all sprints from a board

EXAMPLES
  $ jira jira board versions 123

  $ jira jira board versions 123 --released false
```

_See code: [src/commands/jira/board/versions.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/board/versions.ts)_

## `jira jira issue assign ISSUEID ACCOUNTID`

Assigns an issue to a user

```
USAGE
  $ jira jira issue assign ISSUEID ACCOUNTID [-p <value>]

ARGUMENTS
  ISSUEID    Issue ID or issue key
  ACCOUNTID  Account ID of the user

FLAGS
  -p, --profile=<value>  Authentication profile name

DESCRIPTION
  Assigns an issue to a user

EXAMPLES
  $ jira jira issue assign PROJ-123 5b10ac8d82e05b22cc7d4ef5
```

_See code: [src/commands/jira/issue/assign.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/assign.ts)_

## `jira jira issue attachment ISSUEID FILE`

Add an attachment to a Jira issue

```
USAGE
  $ jira jira issue attachment ISSUEID FILE [-p <value>] [--toon]

ARGUMENTS
  ISSUEID  Issue ID or issue key
  FILE     Path to the file to upload

FLAGS
  -p, --profile=<value>  Authentication profile name
      --toon             Format output as toon

DESCRIPTION
  Add an attachment to a Jira issue

EXAMPLES
  $ jira jira issue attachment PROJ-123 ./document.pdf
```

_See code: [src/commands/jira/issue/attachment.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/attachment.ts)_

## `jira jira issue attachment-download ISSUEID ATTACHMENTID [OUTPUTPATH]`

Download attachment from an issue

```
USAGE
  $ jira jira issue attachment-download ISSUEID ATTACHMENTID [OUTPUTPATH] [-p <value>] [--toon]

ARGUMENTS
  ISSUEID       Issue ID or issue key
  ATTACHMENTID  Attachment ID
  [OUTPUTPATH]  Output file path

FLAGS
  -p, --profile=<value>  Authentication profile name
      --toon             Format output as toon

DESCRIPTION
  Download attachment from an issue

EXAMPLES
  $ jira jira issue attachment-download PROJ-123 123

  $ jira jira issue attachment-download PROJ-123 123 ~/Desktop/test.jpg
```

_See code: [src/commands/jira/issue/attachment-download.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/attachment-download.ts)_

## `jira jira issue comment ISSUEID BODY`

Add a comment to an issue

```
USAGE
  $ jira jira issue comment ISSUEID BODY [--attach <value>...] [--parent <value>] [-p <value>] [--toon]

ARGUMENTS
  ISSUEID  Issue ID or issue key
  BODY     Comment text content

FLAGS
  -p, --profile=<value>    Authentication profile name
      --attach=<value>...  Path to a file to upload and embed inline (can be used multiple times)
      --parent=<value>     Parent comment ID to reply to
      --toon               Format output as toon

DESCRIPTION
  Add a comment to an issue

EXAMPLES
  $ jira jira issue comment PROJ-123 "# Header
  - Item 1"

  $ jira jira issue comment PROJ-123 "$(cat content.md)"

  $ jira jira issue comment PROJ-123 "Here is the [bug](https://example.com/bug):
  ![screenshot](./screenshot.png)" --attach ./screenshot.png

  $ jira jira issue comment PROJ-123 "Step 1:
  ![step1](./step1.png)
  Step 2:
  ![step2](./step2.png)" --attach ./step1.png --attach ./step2.mp4

  $ jira jira issue comment PROJ-123 "See also" --attach ./extra.png
```

_See code: [src/commands/jira/issue/comment.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/comment.ts)_

## `jira jira issue comment-delete ISSUEID ID`

Delete a comment

```
USAGE
  $ jira jira issue comment-delete ISSUEID ID [-p <value>]

ARGUMENTS
  ISSUEID  Issue ID or issue key
  ID       Comment ID to delete

FLAGS
  -p, --profile=<value>  Authentication profile name

DESCRIPTION
  Delete a comment

EXAMPLES
  $ jira jira issue comment-delete PROJ-123 123
```

_See code: [src/commands/jira/issue/comment-delete.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/comment-delete.ts)_

## `jira jira issue comment-update ISSUEID ID BODY`

Update a comment

```
USAGE
  $ jira jira issue comment-update ISSUEID ID BODY [-p <value>] [--toon]

ARGUMENTS
  ISSUEID  Issue ID or issue key
  ID       Comment ID to delete
  BODY     Comment text content

FLAGS
  -p, --profile=<value>  Authentication profile name
      --toon             Format output as toon

DESCRIPTION
  Update a comment

EXAMPLES
  $ jira jira issue comment-update PROJ-123 123 "
  # Header
  ## Sub-header
  - Item 1
  - Item 2
  ```bash
  ls -a
  ```"

  $ jira jira issue comment-update PROJ-123 123 "$(cat content.md)"
```

_See code: [src/commands/jira/issue/comment-update.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/comment-update.ts)_

## `jira jira issue create`

Create a new issue

```
USAGE
  $ jira jira issue create --fields <value>... [-p <value>] [--toon]

FLAGS
  -p, --profile=<value>    Authentication profile name
      --fields=<value>...  (required) Issue fields in key=value format
      --toon               Format output as toon

DESCRIPTION
  Create a new issue

EXAMPLES
  $ jira jira issue create --fields project='{"key":"PROJ"}' summary="New summary" description="New description" issuetype='{"name":"Dev Task"}'

  $ jira jira issue create --fields project='{"key":"PROJ"}' summary="New summary" timetracking='{"originalEstimate": "5h"}' issuetype='{"name":"Task"}' description='
  # Header
  ## Sub-header
  - Item 1
  - Item 2
  ```bash
  ls -a
  ```'

FLAG DESCRIPTIONS
  --fields=<value>...  Issue fields in key=value format

    Minimum fields required: project, summary, description & issuetype
```

_See code: [src/commands/jira/issue/create.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/create.ts)_

## `jira jira issue delete ISSUEID`

Delete an issue

```
USAGE
  $ jira jira issue delete ISSUEID [-p <value>]

ARGUMENTS
  ISSUEID  Issue ID or issue key to delete

FLAGS
  -p, --profile=<value>  Authentication profile name

DESCRIPTION
  Delete an issue

EXAMPLES
  $ jira jira issue delete PROJ-123
```

_See code: [src/commands/jira/issue/delete.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/delete.ts)_

## `jira jira issue dev ISSUEID`

Get development detail for an issue

```
USAGE
  $ jira jira issue dev ISSUEID [--application-type <value>] [--data-type <value>] [-p <value>] [--toon]

ARGUMENTS
  ISSUEID  Issue ID

FLAGS
  -p, --profile=<value>           Authentication profile name
      --application-type=<value>  [default: bitbucket] Application type (e.g. bitbucket, github)
      --data-type=<value>         [default: pullrequest] Data type (e.g. repository, branch, commit, pullrequest)
      --toon                      Format output as toon

DESCRIPTION
  Get development detail for an issue

EXAMPLES
  $ jira jira issue dev 12345 --application-type bitbucket --data-type repository
```

_See code: [src/commands/jira/issue/dev.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/dev.ts)_

## `jira jira issue get ISSUEID`

Get details of a specific issue

```
USAGE
  $ jira jira issue get ISSUEID [-p <value>] [--toon]

ARGUMENTS
  ISSUEID  Issue ID or issue key

FLAGS
  -p, --profile=<value>  Authentication profile name
      --toon             Format output as toon

DESCRIPTION
  Get details of a specific issue

EXAMPLES
  $ jira jira issue get PROJ-123
```

_See code: [src/commands/jira/issue/get.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/get.ts)_

## `jira jira issue search JQL`

Searches for issues using JQL

```
USAGE
  $ jira jira issue search JQL [--fields <value>] [--max <value>] [--next <value>] [-p <value>] [--toon]

ARGUMENTS
  JQL  JQL expression

FLAGS
  -p, --profile=<value>  Authentication profile name
      --fields=<value>   Extra list of fields to return
      --max=<value>      Maximum number of items per page
      --next=<value>     Token for next page
      --toon             Format output as toon

DESCRIPTION
  Searches for issues using JQL

EXAMPLES
  $ jira jira issue search 'project=PROJ AND summary ~ "Error saving file" AND status IN ("ready", "in progress")'

  $ jira jira issue search 'assignee="john@email.com" AND type=Bug' --max 5 --next CiEjU3RyaW5nJlUwRlVTRkpGUlE9PSVJbnQmTkRFd05qST0QAhiQqtD4wTMiKGFzc2lnbmVlPSJhbGxlbkBpbmN1YmU4LnNnIiBBTkQgdHlwZT1CdWcqAltd

  $ jira jira issue search 'timeestimate > 4h' --fields comment,creator,timeestimate
```

_See code: [src/commands/jira/issue/search.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/search.ts)_

## `jira jira issue transition ISSUEID TRANSITIONID`

Performs an issue transition

```
USAGE
  $ jira jira issue transition ISSUEID TRANSITIONID [-p <value>]

ARGUMENTS
  ISSUEID       Issue ID or issue key
  TRANSITIONID  Issue transition ID

FLAGS
  -p, --profile=<value>  Authentication profile name

DESCRIPTION
  Performs an issue transition

EXAMPLES
  $ jira jira issue transition PROJ-123 123
```

_See code: [src/commands/jira/issue/transition.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/transition.ts)_

## `jira jira issue transitions ISSUEID`

Get transitions that can be performed by the user on an issue

```
USAGE
  $ jira jira issue transitions ISSUEID [-p <value>] [--toon]

ARGUMENTS
  ISSUEID  Issue ID or issue key

FLAGS
  -p, --profile=<value>  Authentication profile name
      --toon             Format output as toon

DESCRIPTION
  Get transitions that can be performed by the user on an issue

EXAMPLES
  $ jira jira issue transitions PROJ-123
```

_See code: [src/commands/jira/issue/transitions.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/transitions.ts)_

## `jira jira issue update ISSUEID`

Update an existing issue

```
USAGE
  $ jira jira issue update ISSUEID --fields <value>... [-p <value>]

ARGUMENTS
  ISSUEID  Issue ID or issue key

FLAGS
  -p, --profile=<value>    Authentication profile name
      --fields=<value>...  (required) Issue fields to update in key=value format

DESCRIPTION
  Update an existing issue

EXAMPLES
  $ jira jira issue update PROJ-123 --fields summary='New summary' description='New description'

  $ jira jira issue update PROJ-123 --fields description='
  # Header
  ## Sub-header
  - Item 1
  - Item 2
  ```bash
  ls -a
  ```'

  $ jira jira issue update PROJ-123 --fields description="$(cat content.md)"

  $ jira jira issue update PROJ-123 --fields timetracking='{"originalEstimate": "5h"}'
```

_See code: [src/commands/jira/issue/update.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/update.ts)_

## `jira jira issue worklog ISSUEID STARTED TIMESPENT [COMMENT]`

Add a worklog to an issue

```
USAGE
  $ jira jira issue worklog ISSUEID STARTED TIMESPENT [COMMENT] [-p <value>] [--toon]

ARGUMENTS
  ISSUEID    Issue ID or issue key
  STARTED    Datetime the worklog effort started
  TIMESPENT  Time spent working on the issue
  [COMMENT]  Comment text content

FLAGS
  -p, --profile=<value>  Authentication profile name
      --toon             Format output as toon

DESCRIPTION
  Add a worklog to an issue

EXAMPLES
  $ jira jira issue worklog PROJ-123 2026-02-03T12:34:00.000+0000 "1d 4h" "
  # Header
  ## Sub-header"

  $ jira jira issue worklog PROJ-123 $(date +"%Y-%m-%dT%H:%M:%S.000%z") 6h "Fix test"

  $ jira jira issue worklog PROJ-123 $(date +"%Y-%m-%dT08:30:00.000%z") 6h
```

_See code: [src/commands/jira/issue/worklog.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/worklog.ts)_

## `jira jira issue worklog-delete ISSUEID ID`

Delete a worklog

```
USAGE
  $ jira jira issue worklog-delete ISSUEID ID [-p <value>]

ARGUMENTS
  ISSUEID  Issue ID or issue key
  ID       Worklog ID to delete

FLAGS
  -p, --profile=<value>  Authentication profile name

DESCRIPTION
  Delete a worklog

EXAMPLES
  $ jira jira issue worklog-delete PROJ-123 123
```

_See code: [src/commands/jira/issue/worklog-delete.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/worklog-delete.ts)_

## `jira jira issue worklogs ISSUEID`

List all boards

```
USAGE
  $ jira jira issue worklogs ISSUEID [--max <value>] [-p <value>] [--start <value>] [--toon]

ARGUMENTS
  ISSUEID  Issue ID or issue key

FLAGS
  -p, --profile=<value>  Authentication profile name
      --max=<value>      Maximum number of items per page
      --start=<value>    Index of the first item to return
      --toon             Format output as toon

DESCRIPTION
  List all boards

EXAMPLES
  $ jira jira issue worklogs PROJ-123
```

_See code: [src/commands/jira/issue/worklogs.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/issue/worklogs.ts)_

## `jira jira project get PROJECTID`

Get details of a specific project

```
USAGE
  $ jira jira project get PROJECTID [-p <value>] [--toon]

ARGUMENTS
  PROJECTID  Project ID or project key

FLAGS
  -p, --profile=<value>  Authentication profile name
      --toon             Format output as toon

DESCRIPTION
  Get details of a specific project

EXAMPLES
  $ jira jira project get PROJ
```

_See code: [src/commands/jira/project/get.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/project/get.ts)_

## `jira jira project list`

List all accessible projects

```
USAGE
  $ jira jira project list [-p <value>] [--toon]

FLAGS
  -p, --profile=<value>  Authentication profile name
      --toon             Format output as toon

DESCRIPTION
  List all accessible projects

EXAMPLES
  $ jira jira project list
```

_See code: [src/commands/jira/project/list.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/project/list.ts)_

## `jira jira user get [ACCOUNTID]`

Get user information

```
USAGE
  $ jira jira user get [ACCOUNTID] [-p <value>] [-q <value>] [--toon]

ARGUMENTS
  [ACCOUNTID]  User account ID

FLAGS
  -p, --profile=<value>  Authentication profile name
  -q, --query=<value>    Query string that matches user attributes
      --toon             Format output as toon

DESCRIPTION
  Get user information

EXAMPLES
  $ jira jira user get

  $ jira jira user get 5b10ac8d82e05b22cc7d4ef5

  $ jira jira user get --query john

  $ jira jira user get -q john@email.com
```

_See code: [src/commands/jira/user/get.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/user/get.ts)_

## `jira jira user list-assignable ISSUEID`

List users that can be assigned to an issue

```
USAGE
  $ jira jira user list-assignable ISSUEID [-p <value>] [-q <value>] [--toon]

ARGUMENTS
  ISSUEID  Issue ID or issue key

FLAGS
  -p, --profile=<value>  Authentication profile name
  -q, --query=<value>    Query string that matches user attributes
      --toon             Format output as toon

DESCRIPTION
  List users that can be assigned to an issue

EXAMPLES
  $ jira jira user list-assignable PROJ-123

  $ jira jira user list-assignable PROJ-123 -q john
```

_See code: [src/commands/jira/user/list-assignable.ts](https://github.com/hesedcasa/jira/blob/v0.8.0/src/commands/jira/user/list-assignable.ts)_
<!-- commandsstop -->
