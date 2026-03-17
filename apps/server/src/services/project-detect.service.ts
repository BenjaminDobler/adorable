import * as fs from 'fs/promises';
import * as path from 'path';

export type DevServerPreset = 'angular-cli' | 'ong' | 'vite' | 'custom';

export interface NxApp {
  name: string;
  root: string;  // e.g. "apps/editor"
  configurations: string[];  // e.g. ["production", "development"]
  defaultConfiguration?: string;
}

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
  /** Available apps the user can choose from (Nx workspaces, or single app for Angular CLI) */
  apps?: NxApp[];
  /** The selected app (set after user picks one, or auto-selected for single-app projects) */
  selectedApp?: string;
  /** The selected configuration (e.g. "development", "production") */
  selectedConfiguration?: string;
}

/**
 * Auto-detect project configuration from an external project directory.
 * Reads package.json, angular.json, nx.json, project.json, and lock files
 * to determine the framework, package manager, and commands.
 */
export async function detectProjectConfig(projectPath: string, selectedNxApp?: string, selectedConfiguration?: string): Promise<DetectedProjectConfig> {
  const config: DetectedProjectConfig = {
    name: path.basename(projectPath),
    framework: 'unknown',
    packageManager: 'npm',
    commands: {
      install: { cmd: 'npm', args: ['install'] },
      dev: { cmd: 'npx', args: ['@richapps/ong', 'serve'] },
      build: { cmd: 'npx', args: ['@richapps/ong', 'build'] },
    },
    devServerPreset: 'ong',
  };

  // Read package.json
  try {
    const pkgJson = JSON.parse(await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8'));
    if (pkgJson.name) {
      config.name = pkgJson.name;
    }
  } catch {
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
  } else if (hasYarnLock) {
    config.packageManager = 'yarn';
    config.commands.install = { cmd: 'yarn', args: ['install'] };
  }

  // Detect Nx workspace
  const hasNxJson = await fileExists(path.join(projectPath, 'nx.json'));

  if (hasNxJson) {
    config.framework = 'nx';

    // Discover available apps in the workspace
    const nxApps = await discoverNxApps(projectPath);
    if (nxApps.length > 0) {
      config.apps = nxApps;
    }

    // If a specific app is selected (or there's only one), configure commands for it
    const appToServe = selectedNxApp || (nxApps.length === 1 ? nxApps[0].root : null);
    if (appToServe) {
      config.selectedApp = appToServe;
      applyOngCommands(config, appToServe, selectedConfiguration);
    }

    // Use first app name if available
    if (nxApps.length > 0) {
      const selected = nxApps.find(a => a.root === appToServe) || nxApps[0];
      config.name = selected.name;
    }

    return config;
  }

  // Detect Angular CLI
  const hasAngularJson = await fileExists(path.join(projectPath, 'angular.json'));
  if (hasAngularJson) {
    config.framework = 'angular-cli';

    // Extract apps and configurations from angular.json
    try {
      const angularJson = JSON.parse(await fs.readFile(path.join(projectPath, 'angular.json'), 'utf-8'));
      const projects = angularJson.projects || {};
      const apps: NxApp[] = [];

      for (const [projName, proj] of Object.entries(projects) as [string, any][]) {
        const serveTarget = proj.architect?.serve || proj.targets?.serve;
        if (serveTarget) {
          apps.push({
            name: projName,
            root: proj.root || projName,
            configurations: Object.keys(serveTarget.configurations || {}),
            defaultConfiguration: serveTarget.defaultConfiguration,
          });
        }
      }

      if (apps.length > 0) {
        config.apps = apps;
        const appToServe = selectedNxApp || (apps.length === 1 ? apps[0].root : null);
        if (appToServe) {
          config.selectedApp = appToServe;
          applyOngCommands(config, undefined, selectedConfiguration);
        }
        config.name = apps[0].name;
      }
    } catch {
      // Failed to parse angular.json — use defaults
    }
  }

  // If no app selection needed (simple project), apply ong commands with config if provided
  if (!config.apps || config.apps.length === 0) {
    applyOngCommands(config, undefined, selectedConfiguration);
  }

  return config;
}

/**
 * Discover Nx apps by scanning the apps/ directory for project.json files
 * that have a "serve" target (indicating they're servable applications).
 */
async function discoverNxApps(workspaceRoot: string): Promise<NxApp[]> {
  const apps: NxApp[] = [];

  // Check root project.json first (single-project Nx workspace)
  const rootProjectJson = path.join(workspaceRoot, 'project.json');
  if (await fileExists(rootProjectJson)) {
    try {
      const pj = JSON.parse(await fs.readFile(rootProjectJson, 'utf-8'));
      const serveTarget = pj.targets?.serve;
      if (serveTarget || pj.targets?.['serve-static']) {
        apps.push({
          name: pj.name || path.basename(workspaceRoot),
          root: '.',
          configurations: Object.keys(serveTarget?.configurations || {}),
          defaultConfiguration: serveTarget?.defaultConfiguration,
        });
      }
    } catch { /* ignore */ }
  }

  // Scan apps/ directory
  const appsDir = path.join(workspaceRoot, 'apps');
  try {
    const entries = await fs.readdir(appsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const appProjectJson = path.join(appsDir, entry.name, 'project.json');
      if (await fileExists(appProjectJson)) {
        try {
          const pj = JSON.parse(await fs.readFile(appProjectJson, 'utf-8'));
          const serveTarget = pj.targets?.serve;
          if (serveTarget) {
            apps.push({
              name: pj.name || entry.name,
              root: `apps/${entry.name}`,
              configurations: Object.keys(serveTarget.configurations || {}),
              defaultConfiguration: serveTarget.defaultConfiguration,
            });
          }
        } catch { /* ignore */ }
      }
    }
  } catch {
    // No apps/ directory
  }

  return apps;
}

/**
 * Set ong dev/build commands on the config, optionally with --project and -c flags.
 */
function applyOngCommands(config: DetectedProjectConfig, projectPath?: string, configuration?: string): void {
  const devArgs = ['@richapps/ong', 'serve'];
  const buildArgs = ['@richapps/ong', 'build'];

  if (projectPath && projectPath !== '.') {
    devArgs.push('--project', projectPath);
    buildArgs.push('--project', projectPath);
  }

  if (configuration) {
    config.selectedConfiguration = configuration;
    devArgs.push('-c', configuration);
    buildArgs.push('-c', configuration);
  }

  config.commands.dev = { cmd: 'npx', args: devArgs };
  config.commands.build = { cmd: 'npx', args: buildArgs };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
