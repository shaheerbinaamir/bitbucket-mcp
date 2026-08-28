#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { bitbucketRequest, defaultWorkspace } from "./bitbucketClient.js";

const server = new McpServer({
  name: "bitbucket-api",
  version: "1.0.0",
});

function textResult(data) {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(err) {
  return {
    content: [{ type: "text", text: `Error: ${err.message}` }],
    isError: true,
  };
}

const UUID_RE = /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$/;
const ACCOUNT_ID_RE = /^\d+:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function reviewerToObject(r) {
  if (UUID_RE.test(r)) {
    const uuid = r.startsWith("{") ? r : `{${r}}`;
    return { uuid };
  }
  if (ACCOUNT_ID_RE.test(r)) {
    return { account_id: r };
  }
  throw new Error(
    `Invalid reviewer identifier "${r}". Bitbucket Cloud requires a UUID (e.g. "{8f232134-7574-41a7-ab89-b511d590cc90}") ` +
      `or an account_id (e.g. "712020:3e524773-ae7c-4c94-8fae-a5a55062f56e") — usernames and display names are not accepted. ` +
      `Use list_workspace_members or get_pull_request (on a PR that already has this person as reviewer/participant) to find their uuid.`
  );
}

const workspaceShape = {
  workspace: z
    .string()
    .optional()
    .describe(
      "Bitbucket workspace ID/slug. Falls back to BITBUCKET_WORKSPACE env var if omitted."
    ),
};

// ---- Repos ----

server.registerTool(
  "list_repos",
  {
    title: "List repositories",
    description: "List repositories in a Bitbucket workspace.",
    inputSchema: {
      ...workspaceShape,
      role: z
        .enum(["owner", "admin", "contributor", "member"])
        .optional()
        .describe("Filter by the authenticated user's role on the repo."),
      query: z.string().optional().describe("Bitbucket query string (e.g. name~\"api\")."),
      pagelen: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ workspace, role, query, pagelen }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const data = await bitbucketRequest(`/repositories/${ws}`, {
        query: { role, q: query, pagelen: pagelen ?? 25 },
      });
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_repo",
  {
    title: "Get repository",
    description: "Get details for a single repository.",
    inputSchema: {
      ...workspaceShape,
      repo_slug: z.string().describe("Repository slug/name."),
    },
  },
  async ({ workspace, repo_slug }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const data = await bitbucketRequest(`/repositories/${ws}/${repo_slug}`);
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_branches",
  {
    title: "List branches",
    description: "List branches for a repository.",
    inputSchema: {
      ...workspaceShape,
      repo_slug: z.string(),
      query: z.string().optional().describe("Bitbucket query string filter on branch name."),
      pagelen: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ workspace, repo_slug, query, pagelen }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const data = await bitbucketRequest(
        `/repositories/${ws}/${repo_slug}/refs/branches`,
        { query: { q: query, pagelen: pagelen ?? 25 } }
      );
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_commits",
  {
    title: "List commits",
    description: "List commits for a repository, optionally on a specific branch.",
    inputSchema: {
      ...workspaceShape,
      repo_slug: z.string(),
      branch: z.string().optional().describe("Branch name to list commits from."),
      pagelen: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ workspace, repo_slug, branch, pagelen }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const path = branch
        ? `/repositories/${ws}/${repo_slug}/commits/${branch}`
        : `/repositories/${ws}/${repo_slug}/commits`;
      const data = await bitbucketRequest(path, {
        query: { pagelen: pagelen ?? 25 },
      });
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ---- Pull Requests ----

server.registerTool(
  "list_pull_requests",
  {
    title: "List pull requests",
    description: "List pull requests for a repository.",
    inputSchema: {
      ...workspaceShape,
      repo_slug: z.string(),
      state: z
        .enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"])
        .optional()
        .describe("Defaults to OPEN."),
      pagelen: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ workspace, repo_slug, state, pagelen }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const data = await bitbucketRequest(
        `/repositories/${ws}/${repo_slug}/pullrequests`,
        { query: { state: state ?? "OPEN", pagelen: pagelen ?? 25 } }
      );
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_pull_request",
  {
    title: "Get pull request",
    description: "Get details for a single pull request.",
    inputSchema: {
      ...workspaceShape,
      repo_slug: z.string(),
      pull_request_id: z.number().int(),
    },
  },
  async ({ workspace, repo_slug, pull_request_id }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const data = await bitbucketRequest(
        `/repositories/${ws}/${repo_slug}/pullrequests/${pull_request_id}`
      );
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_pull_request_diff",
  {
    title: "Get pull request diff",
    description: "Get the raw unified diff for a pull request.",
    inputSchema: {
      ...workspaceShape,
      repo_slug: z.string(),
      pull_request_id: z.number().int(),
    },
  },
  async ({ workspace, repo_slug, pull_request_id }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const data = await bitbucketRequest(
        `/repositories/${ws}/${repo_slug}/pullrequests/${pull_request_id}/diff`
      );
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "create_pull_request",
  {
    title: "Create pull request",
    description: "Create a new pull request.",
    inputSchema: {
      ...workspaceShape,
      repo_slug: z.string(),
      title: z.string(),
      source_branch: z.string(),
      destination_branch: z.string().optional().describe("Defaults to the repo's main branch."),
      description: z.string().optional(),
      close_source_branch: z.boolean().optional(),
      reviewers: z
        .array(z.string())
        .optional()
        .describe(
          "List of reviewer UUIDs (e.g. \"{8f232134-7574-41a7-ab89-b511d590cc90}\") or account_ids. " +
            "Usernames/display names are NOT accepted by Bitbucket Cloud. Use list_workspace_members to look them up."
        ),
    },
  },
  async ({
    workspace,
    repo_slug,
    title,
    source_branch,
    destination_branch,
    description,
    close_source_branch,
    reviewers,
  }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const body = {
        title,
        source: { branch: { name: source_branch } },
        ...(destination_branch
          ? { destination: { branch: { name: destination_branch } } }
          : {}),
        ...(description ? { description } : {}),
        ...(close_source_branch !== undefined ? { close_source_branch } : {}),
        ...(reviewers ? { reviewers: reviewers.map(reviewerToObject) } : {}),
      };
      const data = await bitbucketRequest(
        `/repositories/${ws}/${repo_slug}/pullrequests`,
        { method: "POST", body }
      );
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "update_pull_request_reviewers",
  {
    title: "Update pull request reviewers",
    description:
      "Replace the reviewer list on an existing pull request. This is a full replace " +
      "(Bitbucket's PR PUT endpoint), so it also drops any default reviewers not included here.",
    inputSchema: {
      ...workspaceShape,
      repo_slug: z.string(),
      pull_request_id: z.number().int(),
      reviewers: z
        .array(z.string())
        .describe(
          "List of reviewer UUIDs (e.g. \"{8f232134-7574-41a7-ab89-b511d590cc90}\") or account_ids. " +
            "Usernames/display names are NOT accepted by Bitbucket Cloud. Use list_workspace_members to look them up."
        ),
    },
  },
  async ({ workspace, repo_slug, pull_request_id, reviewers }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const body = { reviewers: reviewers.map(reviewerToObject) };
      const data = await bitbucketRequest(
        `/repositories/${ws}/${repo_slug}/pullrequests/${pull_request_id}`,
        { method: "PUT", body }
      );
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_workspace_members",
  {
    title: "List workspace members",
    description:
      "List members of a Bitbucket workspace, including their uuid — use this to resolve a " +
      "person's uuid for the reviewers argument on create_pull_request / update_pull_request_reviewers.",
    inputSchema: {
      ...workspaceShape,
      pagelen: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ workspace, pagelen }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const data = await bitbucketRequest(`/workspaces/${ws}/members`, {
        query: { pagelen: pagelen ?? 50 },
      });
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "comment_on_pull_request",
  {
    title: "Comment on pull request",
    description: "Add a comment to a pull request (general or inline).",
    inputSchema: {
      ...workspaceShape,
      repo_slug: z.string(),
      pull_request_id: z.number().int(),
      content: z.string().describe("Comment body (Markdown supported)."),
      file_path: z.string().optional().describe("File path for an inline comment."),
      line: z.number().int().optional().describe("Line number for an inline comment."),
    },
  },
  async ({ workspace, repo_slug, pull_request_id, content, file_path, line }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const body = {
        content: { raw: content },
        ...(file_path
          ? { inline: { path: file_path, ...(line ? { to: line } : {}) } }
          : {}),
      };
      const data = await bitbucketRequest(
        `/repositories/${ws}/${repo_slug}/pullrequests/${pull_request_id}/comments`,
        { method: "POST", body }
      );
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "approve_pull_request",
  {
    title: "Approve pull request",
    description: "Approve a pull request as the authenticated user.",
    inputSchema: {
      ...workspaceShape,
      repo_slug: z.string(),
      pull_request_id: z.number().int(),
    },
  },
  async ({ workspace, repo_slug, pull_request_id }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const data = await bitbucketRequest(
        `/repositories/${ws}/${repo_slug}/pullrequests/${pull_request_id}/approve`,
        { method: "POST" }
      );
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "merge_pull_request",
  {
    title: "Merge pull request",
    description: "Merge a pull request.",
    inputSchema: {
      ...workspaceShape,
      repo_slug: z.string(),
      pull_request_id: z.number().int(),
      merge_strategy: z
        .enum(["merge_commit", "squash", "fast_forward"])
        .optional()
        .describe("Defaults to the repo's default merge strategy."),
      close_source_branch: z.boolean().optional(),
      message: z.string().optional().describe("Custom merge commit message."),
    },
  },
  async ({
    workspace,
    repo_slug,
    pull_request_id,
    merge_strategy,
    close_source_branch,
    message,
  }) => {
    try {
      const ws = defaultWorkspace(workspace);
      const body = {
        ...(merge_strategy ? { merge_strategy } : {}),
        ...(close_source_branch !== undefined ? { close_source_branch } : {}),
        ...(message ? { message } : {}),
      };
      const data = await bitbucketRequest(
        `/repositories/${ws}/${repo_slug}/pullrequests/${pull_request_id}/merge`,
        { method: "POST", body }
      );
      return textResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
