import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CdpService {
  private apiUrl =
    ((window as any).electronAPI?.nativeAgentUrl || 'http://localhost:3334') +
    '/api/native/cdp/evaluate';

  readonly agentBaseUrl =
    (window as any).electronAPI?.nativeAgentUrl || 'http://localhost:3334';

  cdpAvailable = signal(false);

  async checkAvailability(): Promise<boolean> {
    try {
      const result = await this.evaluate('typeof window.ng !== "undefined"');
      const available = result === true || result === 'true';
      this.cdpAvailable.set(available);
      return available;
    } catch {
      this.cdpAvailable.set(false);
      return false;
    }
  }

  async evaluate(expression: string): Promise<any> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression }),
    });
    if (!response.ok) throw new Error(`CDP evaluate failed: ${response.status}`);
    const data = await response.json();
    return data.result?.value ?? data.result ?? data;
  }
}
