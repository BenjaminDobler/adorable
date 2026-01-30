import { NativeManager } from './native-manager';

export class NativeRegistry {
  private managers = new Map<string, NativeManager>();

  getManager(userId: string): NativeManager {
    let manager = this.managers.get(userId);
    if (!manager) {
      manager = new NativeManager();
      this.managers.set(userId, manager);
    }
    return manager;
  }

  async removeManager(userId: string) {
    const manager = this.managers.get(userId);
    if (manager) {
      await manager.stop();
      this.managers.delete(userId);
    }
  }
}

export const nativeRegistry = new NativeRegistry();
