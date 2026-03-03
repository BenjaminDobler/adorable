import { FileTree } from '@adorable/shared-types';
import { gitService } from '../../services/git.service';
import { projectFsService } from '../../services/project-fs.service';
import * as path from 'path';
import * as fs from 'fs/promises';

const GITHUB_API = 'https://api.github.com';

interface GitFile {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

export class GitHubSyncService {

  /**
   * Convert FileTree to flat list of GitFiles
   */
  flattenFiles(files: FileTree, prefix = ''): GitFile[] {
    const result: GitFile[] = [];

    for (const [name, node] of Object.entries(files)) {
      const path = prefix ? `${prefix}/${name}` : name;

      if (node.file) {
        // Check if content is base64 encoded (binary file)
        const isBase64 = typeof node.file.contents === 'string' &&
          (node.file as any).encoding === 'base64';

        result.push({
          path,
          content: node.file.contents,
          encoding: isBase64 ? 'base64' : 'utf-8',
        });
      } else if (node.directory) {
        result.push(...this.flattenFiles(node.directory, path));
      }
    }

    return result;
  }

  /**
   * Convert flat file list back to FileTree structure
   */
  unflattenFiles(files: GitFile[]): FileTree {
    const result: FileTree = {};

    for (const file of files) {
      const parts = file.path.split('/');
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = { directory: {} };
        }
        current = current[part].directory!;
      }

      const fileName = parts[parts.length - 1];
      current[fileName] = {
        file: {
          contents: file.content,
          ...(file.encoding === 'base64' ? { encoding: 'base64' } : {}),
        } as any,
      };
    }

    return result;
  }

  /**
   * Push project to GitHub using native git push.
   * Uses the project's local git repo which already has full AI-generation history.
   */
  async pushToGitHub(
    accessToken: string,
    fullName: string,
    branch: string,
    projectId: string,
    commitMessage: string
  ): Promise<string> {
    const projectPath = projectFsService.getProjectPath(projectId);
    const remoteName = 'github';
    const remoteUrl = `https://x-access-token:${accessToken}@github.com/${fullName}.git`;

    console.log(`[GitHub Sync] Starting git push to ${fullName}/${branch}`);

    try {
      // Ensure local repo is initialized and commit any uncommitted changes
      await gitService.commit(projectPath, commitMessage);

      // Verify we have at least one commit
      const headSha = await gitService.getHeadSha(projectPath);
      if (!headSha) {
        throw new Error('No commits in local repository. Save the project first.');
      }

      // Add temporary remote with embedded token
      await gitService.ensureRemote(projectPath, remoteName, remoteUrl);

      // Force push local history to remote branch
      console.log(`[GitHub Sync] Pushing to ${remoteName} HEAD:${branch}`);
      await gitService.pushToRemote(projectPath, remoteName, branch);

      console.log(`[GitHub Sync] Push complete, HEAD: ${headSha}`);
      return headSha;
    } finally {
      // Always remove the remote to avoid leaving the token on disk
      await gitService.removeRemote(projectPath, remoteName);
    }
  }

  /**
   * Pull files from GitHub repository
   */
  async pullFromGitHub(
    accessToken: string,
    fullName: string,
    branch: string
  ): Promise<{ files: FileTree; commitSha: string }> {
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    };

    // 1. Get the tree for the branch (recursively)
    const treeResponse = await fetch(
      `${GITHUB_API}/repos/${fullName}/git/trees/${branch}?recursive=1`,
      { headers }
    );

    if (!treeResponse.ok) {
      throw new Error(`Failed to get tree: ${treeResponse.status}`);
    }

    const treeData = await treeResponse.json();

    // 2. Get the latest commit SHA
    const refResponse = await fetch(
      `${GITHUB_API}/repos/${fullName}/git/refs/heads/${branch}`,
      { headers }
    );

    const refData = await refResponse.json();
    const commitSha = refData.object.sha;

    // 3. Fetch content for each blob
    const gitFiles: GitFile[] = [];

    for (const item of treeData.tree) {
      if (item.type !== 'blob') continue;

      // Skip node_modules, dist, and system files
      if (item.path.startsWith('node_modules/') || item.path.startsWith('dist/')) continue;
      if (item.path.startsWith('.git/')) continue;
      if (item.path.endsWith('.DS_Store')) continue;

      const blobResponse = await fetch(
        `${GITHUB_API}/repos/${fullName}/git/blobs/${item.sha}`,
        { headers }
      );

      if (!blobResponse.ok) continue;

      const blobData = await blobResponse.json();

      // Check if it's a binary file by checking the path extension
      const isBinary = /\.(png|jpg|jpeg|gif|ico|webp|woff|woff2|ttf|eot|pdf)$/i.test(item.path);

      if (blobData.encoding === 'base64') {
        if (isBinary) {
          gitFiles.push({
            path: item.path,
            content: blobData.content.replace(/\n/g, ''),
            encoding: 'base64',
          });
        } else {
          // Decode base64 to UTF-8 for text files
          const decoded = Buffer.from(blobData.content, 'base64').toString('utf-8');
          gitFiles.push({
            path: item.path,
            content: decoded,
            encoding: 'utf-8',
          });
        }
      } else {
        gitFiles.push({
          path: item.path,
          content: blobData.content,
          encoding: 'utf-8',
        });
      }
    }

    // 4. Convert to FileTree structure
    const files = this.unflattenFiles(gitFiles);

    return { files, commitSha };
  }

  /**
   * Get list of changed files between two commits
   */
  async getChangedFiles(
    accessToken: string,
    fullName: string,
    baseSha: string,
    headSha: string
  ): Promise<string[]> {
    const response = await fetch(
      `${GITHUB_API}/repos/${fullName}/compare/${baseSha}...${headSha}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to compare commits: ${response.status}`);
    }

    const data = await response.json();
    return data.files.map((f: any) => f.filename);
  }

  /**
   * Generate GitHub Actions workflow for deploying to GitHub Pages.
   * Reads angular.json to determine the correct output path.
   */
  generatePagesWorkflow(repoName: string, outputPath: string): string {
    return `# Workflow to build and deploy Angular app to GitHub Pages
name: Deploy to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npx ng build --base-href=/${repoName}/

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '${outputPath}'

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;
  }

  /**
   * Read angular.json from the project to determine the build output path.
   */
  private async getAngularOutputPath(projectPath: string): Promise<string> {
    try {
      const angularJsonPath = path.join(projectPath, 'angular.json');
      const content = await fs.readFile(angularJsonPath, 'utf-8');
      const angularJson = JSON.parse(content);

      // Find the first project with a build target
      for (const [, projectConfig] of Object.entries<any>(angularJson.projects || {})) {
        const outputPath = projectConfig?.architect?.build?.options?.outputPath;
        if (outputPath) {
          // Angular 17+ uses outputPath as object or string
          if (typeof outputPath === 'string') {
            return `./${outputPath}/browser`;
          }
          if (typeof outputPath === 'object' && outputPath.base) {
            return `./${outputPath.base}/browser`;
          }
        }
      }
    } catch {
      // angular.json not found or not parseable
    }
    return './dist/app/browser';
  }

  /**
   * Add GitHub Pages workflow to a repository.
   * Writes the workflow file to the project on disk, then uses git push.
   */
  async setupGitHubPagesWorkflow(
    accessToken: string,
    fullName: string,
    branch: string,
    projectId: string
  ): Promise<string> {
    const repoName = fullName.split('/')[1];
    const projectPath = projectFsService.getProjectPath(projectId);

    // Determine the correct output path from angular.json
    const outputPath = await this.getAngularOutputPath(projectPath);
    console.log(`[GitHub Pages] Detected output path: ${outputPath}`);

    // Generate and write the workflow file to disk
    const workflowContent = this.generatePagesWorkflow(repoName, outputPath);
    const workflowDir = path.join(projectPath, '.github', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });
    await fs.writeFile(path.join(workflowDir, 'deploy-pages.yml'), workflowContent);

    // Push using git (commit + push happens inside pushToGitHub)
    const commitSha = await this.pushToGitHub(
      accessToken,
      fullName,
      branch,
      projectId,
      'Add GitHub Pages deployment workflow'
    );

    return commitSha;
  }

  /**
   * Enable GitHub Pages using the new GitHub Actions deployment
   */
  async enableGitHubPagesWithActions(
    accessToken: string,
    fullName: string
  ): Promise<{ url: string }> {
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };

    // First, make the repository public (required for GitHub Pages on free accounts)
    console.log(`[GitHub Pages] Making repository ${fullName} public...`);
    const visibilityResponse = await fetch(`${GITHUB_API}/repos/${fullName}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        private: false,
      }),
    });

    if (!visibilityResponse.ok) {
      const error = await visibilityResponse.text();
      console.warn(`[GitHub Pages] Failed to make repo public: ${error}`);
      // Continue anyway - might already be public or user has Pro account
    } else {
      console.log(`[GitHub Pages] Repository is now public`);
    }

    // Enable GitHub Pages with GitHub Actions as source
    const response = await fetch(`${GITHUB_API}/repos/${fullName}/pages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        build_type: 'workflow',
      }),
    });

    // 409 means Pages already exists - try to update it
    if (response.status === 409) {
      const updateResponse = await fetch(`${GITHUB_API}/repos/${fullName}/pages`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          build_type: 'workflow',
        }),
      });

      if (!updateResponse.ok && updateResponse.status !== 409) {
        console.warn('Failed to update Pages config:', await updateResponse.text());
      }
    } else if (!response.ok) {
      const error = await response.json();
      // Don't throw - Pages might already be configured differently
      console.warn('Failed to enable Pages:', error.message);
    }

    // Get the Pages URL
    const [owner, repo] = fullName.split('/');
    const pagesUrl = `https://${owner}.github.io/${repo}/`;

    return { url: pagesUrl };
  }
}

export const syncService = new GitHubSyncService();
