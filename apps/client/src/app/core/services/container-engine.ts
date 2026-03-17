import { Signal, WritableSignal } from '@angular/core';
import { Observable } from 'rxjs';
import { FileTree } from '@adorable/shared-types';
import { DevServerPreset, KitCommands } from './kit-types';

export const DEV_SERVER_PRESETS: Record<DevServerPreset, { urlPattern: RegExp; readyPattern: RegExp }> = {
  'angular-cli': {
    urlPattern: /Local:\s+(https?:\/\/localhost:\d+)/,
    readyPattern: /Application bundle generation complete/,
  },
  'ong': {
    urlPattern: /Local:\s+(https?:\/\/localhost:\d+)/,
    readyPattern: /\[ong\] Dev server ready/,
  },
  'vite': {
    urlPattern: /Local:\s+(https?:\/\/localhost:\d+)/,
    readyPattern: /ready in \d+/,
  },
  'webpack': {
    urlPattern: /https?:\/\/localhost:\d+/,
    readyPattern: /compiled successfully/,
  },
  'custom': {
    urlPattern: /https?:\/\/localhost:\d+/,
    readyPattern: /.*/,
  },
};

export interface ProcessOutput {
  stream: Observable<string>;
  exit: Promise<number>;
}

export interface DevServerInfo {
  url: string;
  port: number;
}

export abstract class ContainerEngine {
  abstract mode: Signal<'local' | 'native'>;
  abstract status: Signal<string>;
  private _currentProjectId: string | null = null;
  get currentProjectId(): string | null { return this._currentProjectId; }
  set currentProjectId(value: string | null) { this._currentProjectId = value; }
  abstract url: Signal<string | null>;
  abstract buildError: Signal<string | null>;
  abstract previewConsoleLogs: Signal<Array<{ level: 'log'|'warn'|'error', message: string, timestamp: Date }>>;
  abstract serverOutput: Signal<string>;
  abstract shellOutput: Signal<string>;
  
  abstract addConsoleLog(log: { level: 'log'|'warn'|'error', message: string }): void;
  abstract clearServerOutput(): void;
  abstract clearShellOutput(): void;
  abstract clearPreviewLogs(): void;
  abstract clearBuildError(): void;
  
  // Lifecycle
  abstract boot(clean?: boolean, externalPath?: string): Promise<void>;
  abstract teardown(): Promise<void>;

  // File System
  abstract mount(files: FileTree): Promise<void>;
  mountProject?(projectId: string, kitId: string | null): Promise<void>;
  checkStatus?(): Promise<{ running: boolean; projectId?: string; devServerReady?: boolean }>;
  lastBootedProjectId?: string | null;
  abstract writeFile(path: string, content: string | Uint8Array): Promise<void>;
  abstract readFile(path: string): Promise<string>;
  abstract readBinaryFile(path: string): Promise<Uint8Array>;
  abstract deleteFile(path: string): Promise<void>;
  abstract mkdir(path: string): Promise<void>;
  abstract clean(full?: boolean): Promise<void>; // Clean workspace (full=true also removes node_modules/lockfiles)
  abstract startShell(): Promise<void>;
  abstract readdir(path: string, options?: { withFileTypes: boolean }): Promise<any>;

  // Execution
  abstract exec(cmd: string, args: string[], options?: any): Promise<ProcessOutput>;
  abstract writeToShell(data: string): Promise<void>;
  abstract runBuild(args?: string[], command?: { cmd: string; args: string[] }): Promise<number>;

  // High-Level Workflows
  abstract runInstall(command?: { cmd: string; args: string[] }): Promise<number>;
  abstract startDevServer(commands?: KitCommands): Promise<void>;
  abstract stopDevServer(): Promise<void>;
  
  abstract on(event: 'server-ready', callback: (port: number, url: string) => void): void;
}
