import { GitHubUser, GitHubRepository } from '@adorable/shared-types';

const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH = 'https://github.com/login/oauth';

export class GitHubService {
  // Read env vars lazily to ensure dotenv has loaded
  private get clientId(): string {
    return process.env.GITHUB_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.GITHUB_CLIENT_SECRET || '';
  }

  private get callbackUrl(): string {
    return process.env.GITHUB_CALLBACK_URL || 'http://localhost:3333/api/github/callback';
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: 'repo workflow user:email',
      state,
    });
    return `${GITHUB_OAUTH}/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<string> {
    const response = await fetch(`${GITHUB_OAUTH}/access_token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }
    return data.access_token;
  }

  async getUser(accessToken: string): Promise<GitHubUser> {
    const response = await fetch(`${GITHUB_API}/user`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  }

  async listRepositories(accessToken: string): Promise<GitHubRepository[]> {
    const repos: GitHubRepository[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await fetch(
        `${GITHUB_API}/user/repos?per_page=${perPage}&page=${page}&sort=updated`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();
      repos.push(...data);

      if (data.length < perPage) break;
      page++;
    }

    return repos;
  }

  async getRepository(accessToken: string, fullName: string): Promise<GitHubRepository> {
    const response = await fetch(`${GITHUB_API}/repos/${fullName}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  }

  async createRepository(
    accessToken: string,
    name: string,
    isPrivate: boolean = true,
    description?: string
  ): Promise<GitHubRepository> {
    const response = await fetch(`${GITHUB_API}/user/repos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        private: isPrivate,
        description,
        auto_init: true, // Creates initial commit with README
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    return response.json();
  }

  async getDefaultBranch(accessToken: string, fullName: string): Promise<string> {
    const repo = await this.getRepository(accessToken, fullName);
    return repo.default_branch;
  }

  async getLatestCommit(accessToken: string, fullName: string, branch: string): Promise<string> {
    const response = await fetch(
      `${GITHUB_API}/repos/${fullName}/commits/${branch}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    return data.sha;
  }

  async createWebhook(
    accessToken: string,
    fullName: string,
    webhookUrl: string,
    secret: string
  ): Promise<number> {
    const response = await fetch(`${GITHUB_API}/repos/${fullName}/hooks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret,
          insecure_ssl: '0',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    return data.id;
  }

  async deleteWebhook(accessToken: string, fullName: string, webhookId: string): Promise<void> {
    const response = await fetch(
      `${GITHUB_API}/repos/${fullName}/hooks/${webhookId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
  }

  /**
   * Get GitHub Pages status for a repository
   */
  async getPages(accessToken: string, fullName: string): Promise<{ enabled: boolean; url?: string; status?: string }> {
    const response = await fetch(`${GITHUB_API}/repos/${fullName}/pages`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (response.status === 404) {
      return { enabled: false };
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      enabled: true,
      url: data.html_url,
      status: data.status,
    };
  }

  /**
   * Enable GitHub Pages on the gh-pages branch
   */
  async enablePages(accessToken: string, fullName: string): Promise<{ url: string }> {
    const response = await fetch(`${GITHUB_API}/repos/${fullName}/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: {
          branch: 'gh-pages',
          path: '/',
        },
      }),
    });

    // 409 means Pages already exists
    if (response.status === 409) {
      const pages = await this.getPages(accessToken, fullName);
      return { url: pages.url || '' };
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    return { url: data.html_url };
  }

  /**
   * Check if a branch exists
   */
  async branchExists(accessToken: string, fullName: string, branch: string): Promise<boolean> {
    const response = await fetch(`${GITHUB_API}/repos/${fullName}/branches/${branch}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    return response.ok;
  }

  /**
   * Create an orphan branch (for gh-pages)
   */
  async createOrphanBranch(
    accessToken: string,
    fullName: string,
    branch: string,
    files: { path: string; content: string }[]
  ): Promise<string> {
    // Create blobs for all files
    const blobs = await Promise.all(
      files.map(async (file) => {
        const blobResponse = await fetch(`${GITHUB_API}/repos/${fullName}/git/blobs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: Buffer.from(file.content).toString('base64'),
            encoding: 'base64',
          }),
        });

        if (!blobResponse.ok) {
          throw new Error(`Failed to create blob for ${file.path}`);
        }

        const blobData = await blobResponse.json();
        return {
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blobData.sha,
        };
      })
    );

    // Create tree
    const treeResponse = await fetch(`${GITHUB_API}/repos/${fullName}/git/trees`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tree: blobs }),
    });

    if (!treeResponse.ok) {
      throw new Error('Failed to create tree');
    }

    const treeData = await treeResponse.json();

    // Create commit (no parent = orphan)
    const commitResponse = await fetch(`${GITHUB_API}/repos/${fullName}/git/commits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Deploy to GitHub Pages from Adorable',
        tree: treeData.sha,
        // No parents = orphan commit
      }),
    });

    if (!commitResponse.ok) {
      throw new Error('Failed to create commit');
    }

    const commitData = await commitResponse.json();

    // Create or update branch reference
    const refResponse = await fetch(`${GITHUB_API}/repos/${fullName}/git/refs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: commitData.sha,
      }),
    });

    // If branch already exists, update it
    if (refResponse.status === 422) {
      const updateResponse = await fetch(`${GITHUB_API}/repos/${fullName}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sha: commitData.sha,
          force: true,
        }),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update branch reference');
      }
    } else if (!refResponse.ok) {
      throw new Error('Failed to create branch reference');
    }

    return commitData.sha;
  }
}

export const githubService = new GitHubService();
