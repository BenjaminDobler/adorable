import { WebContainerFiles, FileSystemNode } from '@adorable/shared-types';

const GITHUB_API = 'https://api.github.com';

interface GitTreeEntry {
  path: string;
  mode: '100644' | '100755' | '040000' | '160000' | '120000';
  type: 'blob' | 'tree' | 'commit';
  sha?: string;
  content?: string;
}

interface GitFile {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

export class GitHubSyncService {

  /**
   * Convert WebContainerFiles to flat list of GitFiles
   */
  flattenFiles(files: WebContainerFiles, prefix = ''): GitFile[] {
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
   * Convert flat file list back to WebContainerFiles structure
   */
  unflattenFiles(files: GitFile[]): WebContainerFiles {
    const result: WebContainerFiles = {};

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
   * Push files to GitHub repository using the Git Data API
   * This creates a new commit with all the files
   */
  async pushToGitHub(
    accessToken: string,
    fullName: string,
    branch: string,
    files: WebContainerFiles,
    commitMessage: string
  ): Promise<string> {
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    console.log(`[GitHub Sync] Starting push to ${fullName}/${branch}`);
    console.log(`[GitHub Sync] Using token: ${accessToken.substring(0, 10)}...`);

    // 1. Get the current commit SHA of the branch
    const refResponse = await fetch(
      `${GITHUB_API}/repos/${fullName}/git/refs/heads/${branch}`,
      { headers }
    );

    let currentCommitSha: string | null = null;
    let baseTreeSha: string | null = null;

    if (refResponse.ok) {
      const refData = await refResponse.json();
      currentCommitSha = refData.object.sha;
      console.log(`[GitHub Sync] Current commit SHA: ${currentCommitSha}`);

      // 2. Get the tree SHA of the current commit
      const commitResponse = await fetch(
        `${GITHUB_API}/repos/${fullName}/git/commits/${currentCommitSha}`,
        { headers }
      );

      if (commitResponse.ok) {
        const commitData = await commitResponse.json();
        baseTreeSha = commitData.tree.sha;
        console.log(`[GitHub Sync] Base tree SHA: ${baseTreeSha}`);
      }
    } else if (refResponse.status === 404) {
      // Repository is empty - no commits yet
      console.log(`[GitHub Sync] Branch ${branch} not found - repo appears to be empty, will create initial commit`);
    } else {
      const errorText = await refResponse.text();
      throw new Error(`Failed to get branch ref: ${refResponse.status} - ${errorText}`);
    }

    // 3. Use Contents API to update files (more reliable than Git Data API)
    const flatFiles = this.flattenFiles(files);

    console.log(`[GitHub Sync] Processing ${flatFiles.length} files for push using Contents API`);

    // Get current files in repo to find their SHAs (needed for updates)
    const existingFiles = new Map<string, string>();
    try {
      const contentsResponse = await fetch(
        `${GITHUB_API}/repos/${fullName}/git/trees/${branch}?recursive=1`,
        { headers }
      );
      if (contentsResponse.ok) {
        const contentsData = await contentsResponse.json();
        for (const item of contentsData.tree) {
          if (item.type === 'blob') {
            existingFiles.set(item.path, item.sha);
          }
        }
        console.log(`[GitHub Sync] Found ${existingFiles.size} existing files in repo`);
      }
    } catch (e) {
      console.log(`[GitHub Sync] Could not fetch existing files, will create new`);
    }

    let successCount = 0;
    let lastCommitSha = currentCommitSha;

    for (const file of flatFiles) {
      // Skip certain files
      if (file.path === 'node_modules' || file.path.startsWith('node_modules/')) continue;
      if (file.path === 'dist' || file.path.startsWith('dist/')) continue;
      if (file.path === '.angular' || file.path.startsWith('.angular/')) continue;
      if (file.path.endsWith('.DS_Store')) continue;

      const contentBase64 = file.encoding === 'base64'
        ? file.content
        : Buffer.from(file.content).toString('base64');

      const payload: any = {
        message: successCount === 0 ? commitMessage : `Update ${file.path}`,
        content: contentBase64,
        branch,
      };

      // If file exists, we need to provide its SHA
      const existingSha = existingFiles.get(file.path);
      if (existingSha) {
        payload.sha = existingSha;
      }

      // URL-encode each path segment but preserve slashes
      const encodedPath = file.path.split('/').map(segment => encodeURIComponent(segment)).join('/');
      const url = `${GITHUB_API}/repos/${fullName}/contents/${encodedPath}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        lastCommitSha = data.commit.sha;
        successCount++;
        // Update existing files map with new SHA for subsequent requests
        existingFiles.set(file.path, data.content.sha);
        if (successCount <= 3 || successCount % 5 === 0) {
          console.log(`[GitHub Sync] Updated ${file.path} (${successCount}/${flatFiles.length})`);
        }
      } else {
        const errorText = await response.text();
        console.error(`[GitHub Sync] Failed to update ${file.path}: ${response.status} - ${errorText}`);
        console.error(`[GitHub Sync] URL was: ${url}`);

        // If 409 conflict, try to get the current SHA and retry
        if (response.status === 409) {
          console.log(`[GitHub Sync] Conflict detected, fetching current SHA...`);
          try {
            const getResponse = await fetch(url, { headers });
            if (getResponse.ok) {
              const getData = await getResponse.json();
              payload.sha = getData.sha;
              const retryResponse = await fetch(url, {
                method: 'PUT',
                headers,
                body: JSON.stringify(payload),
              });
              if (retryResponse.ok) {
                const retryData = await retryResponse.json();
                lastCommitSha = retryData.commit.sha;
                successCount++;
                console.log(`[GitHub Sync] Retry succeeded for ${file.path}`);
              }
            }
          } catch (e) {
            console.error(`[GitHub Sync] Retry failed for ${file.path}`);
          }
        }
      }
    }

    console.log(`[GitHub Sync] Successfully updated ${successCount} files`);

    if (successCount === 0) {
      throw new Error('Failed to update any files');
    }

    return lastCommitSha || currentCommitSha || '';
  }

  /**
   * Pull files from GitHub repository
   */
  async pullFromGitHub(
    accessToken: string,
    fullName: string,
    branch: string
  ): Promise<{ files: WebContainerFiles; commitSha: string }> {
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
      const isBinary = /\.(png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot|pdf)$/i.test(item.path);

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

    // 4. Convert to WebContainerFiles structure
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
   * Generate GitHub Actions workflow for deploying to GitHub Pages
   */
  generatePagesWorkflow(repoName: string): string {
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
        run: npm run build -- --base-href=/${repoName}/

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist/app/browser'

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
   * Add GitHub Pages workflow to a repository
   * This pushes a workflow file that will automatically build and deploy on push
   */
  async setupGitHubPagesWorkflow(
    accessToken: string,
    fullName: string,
    branch: string,
    files: WebContainerFiles
  ): Promise<string> {
    const repoName = fullName.split('/')[1];

    // Create the workflow file content
    const workflowContent = this.generatePagesWorkflow(repoName);

    // Add the workflow file to the project files
    const filesWithWorkflow = { ...files };
    if (!filesWithWorkflow['.github']) {
      filesWithWorkflow['.github'] = { directory: {} };
    }
    if (!filesWithWorkflow['.github'].directory!['workflows']) {
      filesWithWorkflow['.github'].directory!['workflows'] = { directory: {} };
    }
    filesWithWorkflow['.github'].directory!['workflows'].directory!['deploy-pages.yml'] = {
      file: { contents: workflowContent }
    };

    // Push the updated files
    const commitSha = await this.pushToGitHub(
      accessToken,
      fullName,
      branch,
      filesWithWorkflow,
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
