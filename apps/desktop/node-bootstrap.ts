import { execSync } from 'child_process';
import { app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';

const NODE_VERSION = 'v20.18.1';
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

function isNodeAvailable(): boolean {
  try {
    execSync('node --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
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
  if (isNodeAvailable()) {
    console.log('[Node Bootstrap] System Node.js found');
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
