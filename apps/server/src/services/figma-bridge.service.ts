import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { FigmaCommand, FigmaSelection } from '@adorable/shared-types';
import { logger } from '../logger';

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface FigmaConnection {
  ws: WebSocket;
  fileKey: string;
  fileName: string;
}

const REQUEST_TIMEOUT_MS = 15_000;

class FigmaBridgeService extends EventEmitter {
  private connections = new Map<string, FigmaConnection>();
  private pendingRequests = new Map<string, PendingRequest>();

  handleConnection(ws: WebSocket, userId: string) {
    // Close existing connection for this user
    const existing = this.connections.get(userId);
    if (existing) {
      existing.ws.close(1000, 'Replaced by new connection');
    }

    // We don't register until we get the hello message
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleMessage(userId, ws, msg);
      } catch (err) {
        logger.error('Figma bridge: invalid message', { userId, error: (err as Error).message });
      }
    });

    ws.on('close', () => {
      const conn = this.connections.get(userId);
      if (conn && conn.ws === ws) {
        this.connections.delete(userId);
        logger.info('Figma bridge: disconnected', { userId });
        this.emit('disconnected', userId);
      }
    });

    ws.on('error', (err) => {
      logger.error('Figma bridge: WebSocket error', { userId, error: err.message });
    });
  }

  private handleMessage(userId: string, ws: WebSocket, msg: any) {
    switch (msg.type) {
      case 'figma:hello': {
        this.connections.set(userId, {
          ws,
          fileKey: msg.fileKey,
          fileName: msg.fileName,
        });
        logger.info('Figma bridge: connected', { userId, fileKey: msg.fileKey, fileName: msg.fileName });
        this.emit('connected', userId, { fileKey: msg.fileKey, fileName: msg.fileName });
        break;
      }

      case 'figma:selection_changed': {
        this.emit('selection_changed', userId, {
          selection: msg.selection as FigmaSelection[],
          pageId: msg.pageId,
          pageName: msg.pageName,
        });
        break;
      }

      case 'figma:document_changed': {
        this.emit('document_changed', userId, {
          changedNodeIds: msg.changedNodeIds as string[],
        });
        break;
      }

      case 'figma:response': {
        const pending = this.pendingRequests.get(msg.requestId);
        if (pending) {
          this.pendingRequests.delete(msg.requestId);
          clearTimeout(pending.timer);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.data);
          }
        }
        break;
      }

      default:
        logger.warn('Figma bridge: unknown message type', { userId, type: msg.type });
    }
  }

  /**
   * Send a command to the Figma plugin and wait for a response.
   */
  async sendCommand(userId: string, command: FigmaCommand): Promise<any> {
    const conn = this.connections.get(userId);
    if (!conn) {
      throw new Error('Figma is not connected');
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Figma bridge request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      conn.ws.send(JSON.stringify({
        type: 'figma:request',
        requestId,
        command,
      }));
    });
  }

  isConnected(userId: string): boolean {
    const conn = this.connections.get(userId);
    return !!conn && conn.ws.readyState === WebSocket.OPEN;
  }

  getConnectionInfo(userId: string): { fileKey: string; fileName: string } | null {
    const conn = this.connections.get(userId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return null;
    return { fileKey: conn.fileKey, fileName: conn.fileName };
  }

  /**
   * Return the userId of the sole active bridge connection, if exactly one
   * exists. Used by CLI local-access flow to auto-resolve the caller.
   */
  getSoleConnectionUserId(): string | null {
    const open: string[] = [];
    for (const [userId, conn] of this.connections) {
      if (conn.ws.readyState === WebSocket.OPEN) open.push(userId);
    }
    return open.length === 1 ? open[0] : null;
  }
}

export const figmaBridge = new FigmaBridgeService();
