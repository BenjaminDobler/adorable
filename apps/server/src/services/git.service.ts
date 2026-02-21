import simpleGit, { SimpleGit, LogResult, CheckRepoActions } from 'simple-git';
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

    // Use 'root' check — without it, checkIsRepo() returns true if the directory
    // is inside ANY git repo (e.g. the parent adorable workspace), which would
    // skip init and cause all git operations to target the wrong repo.
    const isRepoRoot = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT).catch(() => false);
    if (!isRepoRoot) {
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
   * Returns empty log if the project has no git repo.
   */
  async getLog(projectPath: string, limit = 50): Promise<LogResult> {
    const git = simpleGit(projectPath);
    const isRepoRoot = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT).catch(() => false);
    if (!isRepoRoot) {
      return { all: [], total: 0, latest: null } as unknown as LogResult;
    }
    return git.log({ maxCount: limit });
  }

  /**
   * Restore all tracked files to the state at a specific commit.
   * Also removes files that exist in the current tree but not in the target commit.
   */
  async checkout(projectPath: string, sha: string): Promise<void> {
    const git = simpleGit(projectPath);
    const isRepoRoot = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT).catch(() => false);
    if (!isRepoRoot) {
      throw new Error('No git history for this project. Save the project first to create a version.');
    }

    // List files in current HEAD and target commit to detect deletions
    const currentFiles = (await git.raw(['ls-tree', '-r', '--name-only', 'HEAD'])).trim();
    const targetFiles = new Set(
      (await git.raw(['ls-tree', '-r', '--name-only', sha])).trim().split('\n').filter(f => f)
    );

    // Restore all files from the target commit
    if (targetFiles.size > 0) {
      await git.raw(['checkout', sha, '--', ...targetFiles]);
    }

    // Remove files that exist in HEAD but not in the target commit
    if (currentFiles) {
      for (const file of currentFiles.split('\n').filter(f => f)) {
        if (!targetFiles.has(file)) {
          await fs.rm(path.join(projectPath, file), { force: true });
        }
      }
    }

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
