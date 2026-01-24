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
    };

    // 1. Get the current commit SHA of the branch
    const refResponse = await fetch(
      `${GITHUB_API}/repos/${fullName}/git/refs/heads/${branch}`,
      { headers }
    );

    if (!refResponse.ok) {
      throw new Error(`Failed to get branch ref: ${refResponse.status}`);
    }

    const refData = await refResponse.json();
    const currentCommitSha = refData.object.sha;

    // 2. Get the tree SHA of the current commit
    const commitResponse = await fetch(
      `${GITHUB_API}/repos/${fullName}/git/commits/${currentCommitSha}`,
      { headers }
    );

    if (!commitResponse.ok) {
      throw new Error(`Failed to get commit: ${commitResponse.status}`);
    }

    const commitData = await commitResponse.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs for each file and build tree
    const flatFiles = this.flattenFiles(files);
    const treeEntries: GitTreeEntry[] = [];

    for (const file of flatFiles) {
      // Skip certain files that shouldn't be in the repo
      if (file.path === 'node_modules' || file.path.startsWith('node_modules/')) continue;
      if (file.path === 'dist' || file.path.startsWith('dist/')) continue;
      if (file.path === '.angular' || file.path.startsWith('.angular/')) continue;

      // Create blob for the file
      const blobResponse = await fetch(
        `${GITHUB_API}/repos/${fullName}/git/blobs`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content: file.content,
            encoding: file.encoding === 'base64' ? 'base64' : 'utf-8',
          }),
        }
      );

      if (!blobResponse.ok) {
        console.error(`Failed to create blob for ${file.path}`);
        continue;
      }

      const blobData = await blobResponse.json();
      treeEntries.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      });
    }

    // 4. Create a new tree
    const treeResponse = await fetch(
      `${GITHUB_API}/repos/${fullName}/git/trees`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeEntries,
        }),
      }
    );

    if (!treeResponse.ok) {
      throw new Error(`Failed to create tree: ${treeResponse.status}`);
    }

    const treeData = await treeResponse.json();

    // 5. Create a new commit
    const newCommitResponse = await fetch(
      `${GITHUB_API}/repos/${fullName}/git/commits`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: commitMessage,
          tree: treeData.sha,
          parents: [currentCommitSha],
        }),
      }
    );

    if (!newCommitResponse.ok) {
      throw new Error(`Failed to create commit: ${newCommitResponse.status}`);
    }

    const newCommitData = await newCommitResponse.json();

    // 6. Update the branch reference
    const updateRefResponse = await fetch(
      `${GITHUB_API}/repos/${fullName}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          sha: newCommitData.sha,
        }),
      }
    );

    if (!updateRefResponse.ok) {
      throw new Error(`Failed to update ref: ${updateRefResponse.status}`);
    }

    return newCommitData.sha;
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

      // Skip node_modules and dist
      if (item.path.startsWith('node_modules/') || item.path.startsWith('dist/')) continue;
      if (item.path.startsWith('.git/')) continue;

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
}

export const syncService = new GitHubSyncService();
