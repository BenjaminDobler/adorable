import { DockerManager } from './docker-manager';
import { serverConfigService } from '../../services/server-config.service';

export class ContainerRegistry {
  private managers = new Map<string, DockerManager>();
  private activities = new Map<string, number>();

  constructor() {
    // Start the Reaper
    setInterval(() => this.reap(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Count containers that are actively running (not paused/stopped).
   */
  getActiveContainerCount(): number {
    let count = 0;
    for (const manager of this.managers.values()) {
      if (manager.isRunning()) count++;
    }
    return count;
  }

  private getMaxActive(): number {
    return parseInt(serverConfigService.get('containers.maxActive') || '5', 10);
  }

  isAtCapacity(excludeUserId?: string): boolean {
    let count = 0;
    for (const [userId, manager] of this.managers.entries()) {
      if (userId === excludeUserId) continue;
      if (manager.isRunning()) count++;
    }
    return count >= this.getMaxActive();
  }

  getContainerStatuses(): Array<{ userId: string; running: boolean; lastActivity: number | null }> {
    const statuses: Array<{ userId: string; running: boolean; lastActivity: number | null }> = [];
    for (const [userId, manager] of this.managers.entries()) {
      statuses.push({
        userId,
        running: manager.isRunning(),
        lastActivity: this.activities.get(userId) ?? null,
      });
    }
    return statuses;
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
