import { DockerManager } from './docker-manager';

export class ContainerRegistry {
  private managers = new Map<string, DockerManager>();
  private activities = new Map<string, number>();

  constructor() {
    // Start the Reaper
    setInterval(() => this.reap(), 5 * 60 * 1000); // Every 5 minutes
  }

  getManager(userId: string): DockerManager {
    let manager = this.managers.get(userId);
    if (!manager) {
      manager = new DockerManager();
      this.managers.set(userId, manager);
    }
    this.updateActivity(userId);
    return manager;
  }

  updateActivity(userId: string) {
    this.activities.set(userId, Date.now());
  }

  async removeManager(userId: string) {
    const manager = this.managers.get(userId);
    if (manager) {
      await manager.stop();
      this.managers.delete(userId);
      this.activities.delete(userId);
    }
  }

  private async reap() {
    const now = Date.now();
    const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 mins to pause
    const HIBERNATE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours to stop

    for (const [userId, lastActive] of this.activities.entries()) {
      const manager = this.managers.get(userId);
      if (!manager) continue;

      const diff = now - lastActive;

      if (diff > HIBERNATE_TIMEOUT) {
        console.log(`[Reaper] Hibernating container for user ${userId}`);
        await manager.stop(); // Stops and removes container instance
        // We keep the manager in the map but it has no active container
      } else if (diff > IDLE_TIMEOUT) {
        console.log(`[Reaper] Pausing container for user ${userId}`);
        await manager.pause();
      }
    }
  }
}

export const containerRegistry = new ContainerRegistry();
