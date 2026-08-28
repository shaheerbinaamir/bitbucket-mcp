# bitbucket-api MCP server

A local MCP (Model Context Protocol) server that exposes Bitbucket Cloud repos and
pull requests as tools, for use with Cursor (or any MCP-compatible client).

## Tools

- `list_repos`, `get_repo`
- `list_branches`, `list_commits`
- `list_pull_requests`, `get_pull_request`, `get_pull_request_diff`
- `create_pull_request`, `comment_on_pull_request`
- `approve_pull_request`, `merge_pull_request`

## Setup

1. Install dependencies (already done if you're reading this after initial setup):

   ```bash
   npm install
   ```

2. Create a Bitbucket Cloud API token with the scopes you need (repositories +
   pull requests, read/write). Generate it from your Atlassian account settings.

3. Edit `.cursor/mcp.json` and fill in:
   - `BITBUCKET_API_TOKEN` — your API token (required).
   - `BITBUCKET_USERNAME` — leave empty to authenticate with `Authorization: Bearer <token>`.
     Set this to your Atlassian username/email only if your token requires Basic auth instead.
   - `BITBUCKET_WORKSPACE` — optional default workspace slug, so you don't have to pass
     `workspace` on every tool call.

4. Restart Cursor (or reload the MCP server from Cursor's MCP settings panel). The
   `bitbucket` server should show up with its tools available.

### Example `.cursor/mcp.json`

Copy this in and fill in your own token/workspace — do not commit it with real
values (see Security notes below):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "node",
      "args": ["/absolute/path/to/bitbucket-api/src/index.js"],
      "env": {
        "BITBUCKET_API_TOKEN": "your-api-token-here",
        "BITBUCKET_USERNAME": "",
        "BITBUCKET_WORKSPACE": "your-workspace-slug"
      }
    }
  }
}
```

- `args` must be an **absolute path** to `src/index.js` on your machine.
- Leave `BITBUCKET_USERNAME` empty unless your token requires Basic auth.
- `BITBUCKET_WORKSPACE` is optional — omit it (or leave empty) to pass `workspace`
  explicitly on every tool call instead.

## Running standalone (for testing)

```bash
BITBUCKET_API_TOKEN=xxxx BITBUCKET_WORKSPACE=my-team node src/index.js
```

This starts the server on stdio — it's meant to be driven by an MCP client, not
used interactively.

## Notes

- This targets **Bitbucket Cloud** (`api.bitbucket.org/2.0`), not Bitbucket
  Server/Data Center.
- Keep `.cursor/mcp.json` out of version control if you commit your token into it
  (it's already covered by `.gitignore`, but double-check before pushing this repo
  anywhere since the token is a plaintext value in that file).

## Security notes

- The server itself is generic — no hardcoded workspace, credentials, usernames,
  or file paths for any specific machine. All identifying config (token,
  workspace, username) is supplied at runtime via env vars in `.cursor/mcp.json`,
  which is git-ignored.
- Safe to commit/share `src/`, `package.json`, and this README as-is within your
  org or publicly, as long as `.cursor/mcp.json` (or any file where you've pasted
  a real token) stays out of the commit.

## To-dos / known gaps

- **Write endpoints are not all live-verified.**: I've only tested the update pr reviewers endpoint; there are others such as approve, merge PR that I haven't tested yet.

- **Reviewer identification is UUID/account_id only.** Bitbucket Cloud does not
  accept usernames or display names for `reviewers` on create/update. There's no
  tool to search members by name — `list_workspace_members` returns the full
  member list (unfiltered) for manual lookup. A nice-to-have would be a
  `find_workspace_member` tool that filters by display name/nickname client-side.

- **No pagination helper.** All `list_*` tools return Bitbucket's raw paginated
  response (including a `next` link) rather than auto-following pages. Fine for
  now, but large result sets require multiple calls.

- **No rate-limit / retry handling yet** `bitbucketClient.js` does a single fetch
  with no backoff on 429s.
