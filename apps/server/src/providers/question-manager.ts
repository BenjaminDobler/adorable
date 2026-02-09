/**
 * Question option interface
 */
export interface QuestionOption {
  value: string;
  label: string;
  recommended?: boolean;
  preview?: string; // For image type: URL or path to preview
}

/**
 * Question interface for ask_user tool
 */
export interface Question {
  id: string;
  text: string;
  type: 'radio' | 'checkbox' | 'text' | 'color' | 'range' | 'image' | 'code';
  options?: QuestionOption[];
  placeholder?: string;
  required?: boolean;
  default?: string | string[] | number; // For radio/text/color/code: string, checkbox: string[], range: number
  // Range type properties
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // Code type properties
  language?: string;
  // Image type properties
  allowUpload?: boolean;
}

interface PendingQuestionRequest {
  resolve: (answers: Record<string, any>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Manages question requests between the AI tool and the client.
 *
 * Flow:
 * 1. AI calls ask_user tool with questions
 * 2. Server creates a request with unique ID and sends SSE event to client
 * 3. Client displays question UI and user provides answers
 * 4. Client POSTs answers to /api/question/:requestId
 * 5. Server resolves the pending promise and returns answers to AI
 */
class QuestionManager {
  private pendingRequests = new Map<string, PendingQuestionRequest>();
  private requestCounter = 0;

  /**
   * Request answers from the user.
   * @param questions Array of questions to ask
   * @param context Optional context explaining why asking
   * @param onRequest Callback to notify client (via SSE) about the request
   * @param timeoutMs Timeout in milliseconds (default: 5 minutes)
   */
  async requestAnswers(
    questions: Question[],
    context: string | undefined,
    onRequest: (requestId: string, questions: Question[], context?: string) => void,
    timeoutMs = 5 * 60 * 1000
  ): Promise<Record<string, any>> {
    const requestId = `question-${Date.now()}-${++this.requestCounter}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Question request timed out. The user did not respond within the allowed time.'));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Notify client via SSE callback
      onRequest(requestId, questions, context);
    });
  }

  /**
   * Called when client POSTs the answers.
   */
  resolveAnswers(requestId: string, answers: Record<string, any>): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      console.warn(`[QuestionManager] No pending request found for ID: ${requestId}`);
      return false;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);
    pending.resolve(answers);
    return true;
  }

  /**
   * Called if user cancels the question request.
   */
  cancelRequest(requestId: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);
    pending.reject(new Error('User cancelled the question request.'));
    return true;
  }

  /**
   * Check if there's a pending request.
   */
  hasPendingRequest(requestId: string): boolean {
    return this.pendingRequests.has(requestId);
  }
}

// Singleton instance
export const questionManager = new QuestionManager();
