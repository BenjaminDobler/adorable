import { DockerManager } from './docker-manager';

export class ContainerRegistry {
  private managers = new Map<string, DockerManager>();

  getManager(userId: string): DockerManager {
    let manager = this.managers.get(userId);
    if (!manager) {
      manager = new DockerManager();
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

export const containerRegistry = new ContainerRegistry();
