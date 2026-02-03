import { execSync } from 'child_process';
import { app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';

const NODE_VERSION = 'v22.13.1';
const NODE_BASE_URL = `https://nodejs.org/dist/${NODE_VERSION}`;

function getNodeDir(): string {
  return path.join(app.getPath('userData'), 'node');
}

function getNodeBinDir(): string {
  const nodeDir = getNodeDir();
  if (process.platform === 'win32') {
    return nodeDir;
  }
  return path.join(nodeDir, `node-${NODE_VERSION}-${getPlatformArch()}`, 'bin');
}

function getPlatformArch(): string {
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${platform}-${arch}`;
}

function getDownloadUrl(): string {
  const platformArch = getPlatformArch();
  if (process.platform === 'win32') {
    return `${NODE_BASE_URL}/node-${NODE_VERSION}-win-x64.zip`;
  }
  return `${NODE_BASE_URL}/node-${NODE_VERSION}-${platformArch}.tar.gz`;
}

/**
 * Find system Node.js by checking common installation paths.
 * Packaged Electron apps don't inherit the full shell PATH.
 */
function findSystemNode(): string | null {
  const home = os.homedir();

  // Build list of common paths
  const commonPaths: string[] = [];

  if (process.platform === 'win32') {
    commonPaths.push(
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(home, 'AppData', 'Roaming', 'nvm', 'current', 'node.exe'),
    );
  } else {
    // Standard paths
    commonPaths.push(
      '/usr/local/bin/node',
      '/usr/bin/node',
      '/opt/homebrew/bin/node',  // Homebrew on Apple Silicon
      '/opt/local/bin/node',      // MacPorts
    );

    // Volta
    commonPaths.push(path.join(home, '.volta', 'bin', 'node'));

    // fnm
    commonPaths.push(path.join(home, '.fnm', 'current', 'bin', 'node'));
    commonPaths.push(path.join(home, 'Library', 'Application Support', 'fnm', 'current', 'bin', 'node'));

    // nvm - check for default alias or find latest installed version
    const nvmDir = path.join(home, '.nvm', 'versions', 'node');
    if (fs.existsSync(nvmDir)) {
      try {
        const versions = fs.readdirSync(nvmDir).filter(v => v.startsWith('v')).sort().reverse();
        for (const version of versions) {
          commonPaths.push(path.join(nvmDir, version, 'bin', 'node'));
        }
      } catch { /* ignore */ }
    }
    // Also check nvm alias/default symlink
    commonPaths.push(path.join(home, '.nvm', 'current', 'bin', 'node'));

    // asdf
    const asdfNodeDir = path.join(home, '.asdf', 'installs', 'nodejs');
    if (fs.existsSync(asdfNodeDir)) {
      try {
        const versions = fs.readdirSync(asdfNodeDir).sort().reverse();
        for (const version of versions) {
          commonPaths.push(path.join(asdfNodeDir, version, 'bin', 'node'));
        }
      } catch { /* ignore */ }
    }

    // mise (formerly rtx)
    const miseNodeDir = path.join(home, '.local', 'share', 'mise', 'installs', 'node');
    if (fs.existsSync(miseNodeDir)) {
      try {
        const versions = fs.readdirSync(miseNodeDir).sort().reverse();
        for (const version of versions) {
          commonPaths.push(path.join(miseNodeDir, version, 'bin', 'node'));
        }
      } catch { /* ignore */ }
    }
  }

  // First try shell lookup to get the user's configured node
  const shellMethods = process.platform === 'win32'
    ? ['where node']
    : [
        // Try different shells and methods
        '/bin/zsh -l -c "which node"',
        '/bin/bash -l -c "which node"',
        '/bin/sh -c "which node"',
        // Direct PATH check with common profile sources
        '/bin/bash -c "source ~/.bashrc 2>/dev/null; source ~/.bash_profile 2>/dev/null; which node"',
        '/bin/zsh -c "source ~/.zshrc 2>/dev/null; which node"',
      ];

  for (const cmd of shellMethods) {
    try {
      const result = execSync(cmd, {
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 5000,
        env: { ...process.env, HOME: home }
      }).trim();
      const nodePath = result.split('\n')[0];
      if (nodePath && fs.existsSync(nodePath)) {
        console.log(`[Node Bootstrap] Found node via shell: ${nodePath}`);
        return nodePath;
      }
    } catch (e) {
      // This shell method failed, try next
    }
  }

  // Fall back to checking common paths directly
  for (const nodePath of commonPaths) {
    if (fs.existsSync(nodePath)) {
      console.log(`[Node Bootstrap] Found node at common path: ${nodePath}`);
      return nodePath;
    }
  }

  console.log('[Node Bootstrap] Could not find system Node.js');
  return null;
}

function isNodeAvailable(): { available: boolean; nodePath?: string } {
  const nodePath = findSystemNode();
  if (nodePath) {
    // Verify it works and check version
    try {
      const version = execSync(`"${nodePath}" --version`, { stdio: 'pipe', encoding: 'utf-8' }).trim();
      console.log(`[Node Bootstrap] Found system Node.js ${version} at ${nodePath}`);
      return { available: true, nodePath };
    } catch {
      return { available: false };
    }
  }
  return { available: false };
}

function isBundledNodeAvailable(): boolean {
  const binDir = getNodeBinDir();
  const nodeBin = process.platform === 'win32' ? path.join(binDir, 'node.exe') : path.join(binDir, 'node');
  return fs.existsSync(nodeBin);
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (url: string) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          request(response.headers.location!);
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };
    request(url);
  });
}

async function downloadAndExtractNode(): Promise<void> {
  const nodeDir = getNodeDir();
  fs.mkdirSync(nodeDir, { recursive: true });

  const downloadUrl = getDownloadUrl();
  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const archivePath = path.join(nodeDir, `node.${ext}`);

  console.log(`[Node Bootstrap] Downloading Node.js from ${downloadUrl}...`);
  await downloadFile(downloadUrl, archivePath);

  console.log(`[Node Bootstrap] Extracting...`);
  if (process.platform === 'win32') {
    // Use PowerShell to extract zip on Windows
    execSync(`powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${nodeDir}' -Force"`, { stdio: 'pipe' });
  } else {
    execSync(`tar -xzf "${archivePath}" -C "${nodeDir}"`, { stdio: 'pipe' });
  }

  // Clean up archive
  fs.unlinkSync(archivePath);
  console.log(`[Node Bootstrap] Node.js installed to ${nodeDir}`);
}

function prependNodeToPath(): void {
  const binDir = getNodeBinDir();
  const sep = process.platform === 'win32' ? ';' : ':';
  process.env.PATH = `${binDir}${sep}${process.env.PATH}`;
  console.log(`[Node Bootstrap] Added ${binDir} to PATH`);
}

export async function ensureNode(): Promise<void> {
  // 1. Check if system Node.js exists
  const systemNode = isNodeAvailable();
  if (systemNode.available && systemNode.nodePath) {
    // Add the system node's directory to PATH so child processes can find it
    const nodeDir = path.dirname(systemNode.nodePath);
    const sep = process.platform === 'win32' ? ';' : ':';
    if (!process.env.PATH?.includes(nodeDir)) {
      process.env.PATH = `${nodeDir}${sep}${process.env.PATH}`;
      console.log(`[Node Bootstrap] Added system Node.js to PATH: ${nodeDir}`);
    }
    return;
  }

  // 2. Check if bundled Node.js exists
  if (isBundledNodeAvailable()) {
    console.log('[Node Bootstrap] Using bundled Node.js');
    prependNodeToPath();
    return;
  }

  // 3. Need to download — ask user
  const result = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['Download Node.js', 'Cancel'],
    defaultId: 0,
    title: 'Node.js Required',
    message: 'Adorable needs Node.js to run your projects.',
    detail: `Node.js ${NODE_VERSION} will be downloaded (~50MB) and stored locally in the app data folder. This is a one-time setup.`,
  });

  if (result === 1) {
    throw new Error('Node.js is required to run Adorable Desktop');
  }

  await downloadAndExtractNode();
  prependNodeToPath();
}
