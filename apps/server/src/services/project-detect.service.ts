import * as fs from 'fs/promises';
import * as path from 'path';

export type DevServerPreset = 'angular-cli' | 'ong' | 'vite' | 'custom';

export interface DetectedProjectConfig {
  name: string;
  framework: 'angular-cli' | 'nx' | 'unknown';
  packageManager: 'npm' | 'yarn' | 'pnpm';
  commands: {
    install: { cmd: string; args: string[] };
    dev: { cmd: string; args: string[] };
    build: { cmd: string; args: string[] };
  };
  devServerPreset: DevServerPreset;
}

/**
 * Auto-detect project configuration from an external project directory.
 * Reads package.json, angular.json, nx.json, project.json, and lock files
 * to determine the framework, package manager, and commands.
 */
export async function detectProjectConfig(projectPath: string): Promise<DetectedProjectConfig> {
  const config: DetectedProjectConfig = {
    name: path.basename(projectPath),
    framework: 'unknown',
    packageManager: 'npm',
    commands: {
      install: { cmd: 'npm', args: ['install'] },
      dev: { cmd: 'npm', args: ['start'] },
      build: { cmd: 'npm', args: ['run', 'build'] },
    },
    devServerPreset: 'angular-cli',
  };

  // Read package.json
  try {
    const pkgJson = JSON.parse(await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8'));
    if (pkgJson.name) {
      config.name = pkgJson.name;
    }
  } catch {
    // No package.json — return defaults
    return config;
  }

  // Detect package manager from lock files
  const [hasPnpmLock, hasYarnLock] = await Promise.all([
    fileExists(path.join(projectPath, 'pnpm-lock.yaml')),
    fileExists(path.join(projectPath, 'yarn.lock')),
  ]);

  if (hasPnpmLock) {
    config.packageManager = 'pnpm';
    config.commands.install = { cmd: 'pnpm', args: ['install'] };
    config.commands.dev = { cmd: 'pnpm', args: ['start'] };
    config.commands.build = { cmd: 'pnpm', args: ['run', 'build'] };
  } else if (hasYarnLock) {
    config.packageManager = 'yarn';
    config.commands.install = { cmd: 'yarn', args: ['install'] };
    config.commands.dev = { cmd: 'yarn', args: ['start'] };
    config.commands.build = { cmd: 'yarn', args: ['run', 'build'] };
  }

  // Detect Nx workspace
  const [hasNxJson, hasProjectJson] = await Promise.all([
    fileExists(path.join(projectPath, 'nx.json')),
    fileExists(path.join(projectPath, 'project.json')),
  ]);

  if (hasNxJson) {
    config.framework = 'nx';
    // Nx with Angular uses the same dev server output as angular-cli
    config.devServerPreset = 'angular-cli';

    if (hasProjectJson) {
      // Read project.json to find serve/build targets
      try {
        const projectJson = JSON.parse(await fs.readFile(path.join(projectPath, 'project.json'), 'utf-8'));
        const pm = config.packageManager === 'pnpm' ? 'pnpm' : config.packageManager === 'yarn' ? 'yarn' : 'npx';

        if (projectJson.targets?.serve) {
          config.commands.dev = { cmd: pm, args: pm === 'npx' ? ['nx', 'serve'] : ['run', 'nx', 'serve'] };
          if (pm === 'npx') config.commands.dev = { cmd: 'npx', args: ['nx', 'serve'] };
        }
        if (projectJson.targets?.build) {
          config.commands.build = { cmd: pm, args: pm === 'npx' ? ['nx', 'build'] : ['run', 'nx', 'build'] };
          if (pm === 'npx') config.commands.build = { cmd: 'npx', args: ['nx', 'build'] };
        }

        // Check if using vite builder
        const serveExecutor = projectJson.targets?.serve?.executor || '';
        if (serveExecutor.includes('vite')) {
          config.devServerPreset = 'vite';
        }
      } catch {
        // Failed to parse project.json
      }
    }

    return config;
  }

  // Detect Angular CLI
  const hasAngularJson = await fileExists(path.join(projectPath, 'angular.json'));
  if (hasAngularJson) {
    config.framework = 'angular-cli';
  }

  // External projects always use ong for dev/build (enables template annotations for visual editing).
  // ong is a drop-in replacement that reads the same angular.json / project.json config.
  config.commands.dev = { cmd: 'npx', args: ['@richapps/ong', 'serve'] };
  config.commands.build = { cmd: 'npx', args: ['@richapps/ong', 'build'] };
  config.devServerPreset = 'ong';

  return config;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
