import simpleGit, { SimpleGit, LogResult } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs/promises';

const DEFAULT_GITIGNORE = `node_modules/
.angular/
dist/
.cache/
tmp/
.nx/
.DS_Store
`;

export class GitService {
  /**
   * Initialize a git repo in the project directory if not already initialized.
   */
  async initRepo(projectPath: string): Promise<void> {
    await fs.mkdir(projectPath, { recursive: true });
    const git = simpleGit(projectPath);

    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      await git.init();
      console.log(`[Git] Initialized repo at ${projectPath}`);

      // Create .gitignore
      const gitignorePath = path.join(projectPath, '.gitignore');
      try {
        await fs.access(gitignorePath);
      } catch {
        await fs.writeFile(gitignorePath, DEFAULT_GITIGNORE);
      }

      // Configure git user for commits
      await git.addConfig('user.email', 'adorable@noreply.adorable.dev');
      await git.addConfig('user.name', 'Adorable AI');
    }
  }

  /**
   * Stage all changes and commit with the given message.
   * Returns the commit SHA, or null if there was nothing to commit.
   */
  async commit(projectPath: string, message: string): Promise<string | null> {
    await this.initRepo(projectPath);
    const git = simpleGit(projectPath);

    // Stage all changes
    await git.add('-A');

    // Check if there's anything to commit
    const status = await git.status();
    if (status.isClean()) {
      return null;
    }

    const result = await git.commit(message);
    const sha = result.commit;
    console.log(`[Git] Committed ${sha}: ${message}`);
    return sha || null;
  }

  /**
   * Get the commit log for a project.
   */
  async getLog(projectPath: string, limit = 50): Promise<LogResult> {
    const git = simpleGit(projectPath);
    return git.log({ maxCount: limit });
  }

  /**
   * Checkout a specific commit, restoring files to that state.
   * Uses `git checkout <sha> -- .` to restore files without detaching HEAD.
   */
  async checkout(projectPath: string, sha: string): Promise<void> {
    const git = simpleGit(projectPath);
    // Restore all files from the given commit
    await git.checkout([sha, '--', '.']);
    console.log(`[Git] Restored files to commit ${sha}`);
  }

  /**
   * Get the current HEAD SHA.
   */
  async getHeadSha(projectPath: string): Promise<string | null> {
    try {
      const git = simpleGit(projectPath);
      const log = await git.log({ maxCount: 1 });
      return log.latest?.hash || null;
    } catch {
      return null;
    }
  }
}

export const gitService = new GitService();
