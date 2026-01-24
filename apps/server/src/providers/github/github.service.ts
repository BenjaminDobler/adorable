import { GitHubUser, GitHubRepository } from '@adorable/shared-types';

const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH = 'https://github.com/login/oauth';

export class GitHubService {
  private clientId: string;
  private clientSecret: string;
  private callbackUrl: string;

  constructor() {
    this.clientId = process.env.GITHUB_CLIENT_ID || '';
    this.clientSecret = process.env.GITHUB_CLIENT_SECRET || '';
    this.callbackUrl = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3333/api/github/callback';
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: 'repo user:email',
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
}

export const githubService = new GitHubService();
