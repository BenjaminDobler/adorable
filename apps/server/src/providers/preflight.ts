import { FileSystemInterface, HistoryMessage, PreflightDecision, AgentLoopContext } from './types';

/**
 * Preflight router — a lightweight LLM call that makes intelligent decisions
 * about how to handle the incoming request before the main agentic loop starts.
 *
 * Decides: whether to run research, detects topic shifts, suggests context clearing,
 * adjusts reasoning effort, and pre-detects skills.
 *
 * @param preflightLLMCall Provider-specific callback for a fast, low-token LLM call.
 */
export async function runPreflight(
  userPrompt: string,
  history: HistoryMessage[] | undefined,
  contextSummary: string | undefined,
  availableSkills: string[],
  preflightLLMCall: (systemPrompt: string, userPrompt: string) => Promise<string>,
): Promise<PreflightDecision> {
  const defaultDecision: PreflightDecision = {
    runResearch: true,
    topicShift: false,
    suggestClearContext: false,
    reasoningEffort: 'high',
  };

  // Fast-path: skip the LLM router entirely for prompts that obviously don't need research.
  // This saves ~1-2 seconds and avoids the "Researching codebase..." phase for simple requests.
  const lowerPrompt = userPrompt.toLowerCase().trim();
  const isQuestion = /^(can you|could you|please|is there|are there|what|why|how|check|show|tell|explain|debug|fix the|find the|look at)/.test(lowerPrompt);
  const isBuildCheck = /build|error|compile|lint|test|run|serve|screenshot|preview/.test(lowerPrompt) && lowerPrompt.length < 200;
  const isShortFollowUp = lowerPrompt.length < 100 && !!(history?.length);
  const isSimpleChange = /^(change|update|set|make|remove|delete|hide|show|add a|move|rename|swap|replace|toggle)\b/.test(lowerPrompt) && lowerPrompt.length < 200;

  if (isQuestion || isBuildCheck || isSimpleChange) {
    console.log(`[Preflight] Fast-path: skipping research (question=${isQuestion}, buildCheck=${isBuildCheck}, simpleChange=${isSimpleChange})`);
    return {
      runResearch: false,
      topicShift: false,
      suggestClearContext: false,
      reasoningEffort: isBuildCheck || isQuestion ? 'low' : 'medium',
    };
  }

  if (isShortFollowUp) {
    console.log('[Preflight] Fast-path: short follow-up, skipping research');
    return {
      runResearch: false,
      topicShift: false,
      suggestClearContext: false,
      reasoningEffort: 'medium',
    };
  }

  // Build conversation context summary for the router
  let conversationContext = '';
  if (contextSummary) {
    conversationContext += `Conversation summary: ${contextSummary}\n`;
  }
  if (history?.length) {
    // Include last few turns for topic detection
    const recentHistory = history.slice(-6);
    conversationContext += 'Recent conversation:\n';
    for (const msg of recentHistory) {
      const truncated = msg.text.length > 200 ? msg.text.substring(0, 200) + '...' : msg.text;
      conversationContext += `[${msg.role}]: ${truncated}\n`;
    }
  }

  const hasConversation = !!(history?.length || contextSummary);

  const systemPrompt =
    `You are a request router for an AI coding assistant. Analyze the user's prompt and conversation context to make quick routing decisions.\n\n`
    + `Respond with ONLY a valid JSON object (no markdown, no explanation) with these fields:\n`
    + `- "runResearch" (boolean): Should the AI analyze the codebase BEFORE starting? true ONLY for tasks that require understanding multiple existing files first (new features spanning several files, complex refactoring, integrating with existing architecture). false for: questions, build checks, debugging requests, simple changes, styling tweaks, follow-up requests, fix-it requests, adding/removing single elements, and anything where the agent can read files as needed during execution.\n`
    + `- "topicShift" (boolean): Is the user starting a completely new topic unrelated to the recent conversation? Only relevant when conversation history exists, otherwise false.\n`
    + `- "suggestClearContext" (boolean): Should we suggest clearing the conversation? true when: topic shifted AND conversation is long (many turns), or accumulated context would hurt more than help. false for normal follow-ups or short conversations.\n`
    + `- "reasoningEffort" ("low"|"medium"|"high"): How much thinking does this task need? "low" for trivial changes (rename, color change, show/hide). "medium" for moderate tasks (add a button with logic, fix a bug). "high" for complex tasks (new feature, architecture, multi-file changes).\n`
    + (availableSkills.length > 0
      ? `- "skillHint" (string|null): If the prompt clearly matches one of these available skills, return its name: ${availableSkills.join(', ')}. Otherwise null.\n`
      : '')
    + `- "requiresPlan" (boolean): Is this a complex multi-component task that needs a plan before coding? true when: the prompt describes 5+ distinct UI sections/components, multiple files or tabs, or a full page/dashboard with several interactive features. false for simple tasks, single-component changes, or follow-up tweaks.\n`
    + `- "reasoning" (string): One sentence explaining your decision.\n\n`
    + `Rules:\n`
    + `- Be fast and concise — this is a routing decision, not a deep analysis\n`
    + `- When in doubt about runResearch, lean towards false — the main agent can always read files itself\n`
    + `- topicShift should only be true for clear, unambiguous topic changes (e.g. "now let's work on the settings page" after 10 messages about the login page)\n`
    + `- suggestClearContext should be rare — only when stale context would actively hurt\n`
    + `- requiresPlan should be true for ambitious prompts that will produce 5+ files — the plan prevents scope creep and rewrite cycles\n`;

  const routerPrompt = hasConversation
    ? `${conversationContext}\n---\nNew user message: ${userPrompt}`
    : `User message: ${userPrompt}`;

  try {
    console.log('[Preflight] Running preflight router...');
    const response = await preflightLLMCall(systemPrompt, routerPrompt);

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const decision = JSON.parse(jsonMatch[0]) as PreflightDecision;
      console.log(`[Preflight] Decision: research=${decision.runResearch}, topicShift=${decision.topicShift}, clearContext=${decision.suggestClearContext}, effort=${decision.reasoningEffort}, skill=${decision.skillHint || 'none'} — ${decision.reasoning || ''}`);
      return { ...defaultDecision, ...decision };
    }
  } catch (err: any) {
    console.error('[Preflight] Failed, using defaults:', err.message);
  }

  return defaultDecision;
}

/**
 * Uses a lightweight LLM call with the RESEARCH_SYSTEM_PROMPT to:
 * 1. Analyze the user's request + file structure
 * 2. Identify which files are relevant (using read_file/read_files tools)
 * 3. Summarize findings: key patterns, interfaces, dependencies, modification points
 *
 * The summary is injected into the main agent's first message so it can
 * start writing code immediately without spending turns on exploration.
 *
 * @param researchLLMCall Provider-specific callback that makes the actual LLM call.
 *   It receives a prompt, has access to read-only tools, and runs a mini agentic loop
 *   (max 3 turns) before returning the final text summary.
 */
export async function runResearchPhase(
  ctx: AgentLoopContext,
  userPrompt: string,
  fileStructure: string,
  researchLLMCall: (prompt: string, tools: any[], fs: FileSystemInterface) => Promise<string>,
): Promise<string> {
  const { callbacks, logger, fs } = ctx;

  // Only run research if there's a non-trivial file structure to explore
  if (!fileStructure || fileStructure.length < 50) return '';

  console.log('[Research] Starting LLM-based research phase...');
  callbacks.onText?.('\nResearching codebase...\n');

  // Read-only tools for the research agent
  const researchTools = [
    {
      name: 'read_file',
      description: 'Read a single file from the project.',
      input_schema: { type: 'object', properties: { path: { type: 'string', description: 'File path to read' } }, required: ['path'] }
    },
    {
      name: 'read_files',
      description: 'Read multiple files at once. Much faster than individual reads.',
      input_schema: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' }, description: 'Array of file paths to read' } }, required: ['paths'] }
    },
    {
      name: 'list_dir',
      description: 'List files in a directory.',
      input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Directory path' } }, required: ['path'] }
    },
    {
      name: 'glob',
      description: 'Find files matching a pattern.',
      input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts")' } }, required: ['pattern'] }
    },
    {
      name: 'grep',
      description: 'Search for a string in files.',
      input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Search pattern' }, path: { type: 'string', description: 'Directory to search in' } }, required: ['pattern'] }
    },
  ];

  const researchPrompt =
    `The user wants to: ${userPrompt}\n\n`
    + `Here is the project file structure:\n${fileStructure}\n\n`
    + `Your task:\n`
    + `1. Use the read_files tool to read the files most relevant to the user's request (batch them in one call for speed)\n`
    + `2. Focus on: route definitions, component code, services, models/interfaces, and config files that the user's request would touch\n`
    + `3. After reading, provide a concise summary of what you found\n\n`
    + `Important: Read at most 15 files. Prefer .ts files over .html/.scss. Always include app.routes.ts and app.config.ts if they exist.`;

  try {
    const summary = await researchLLMCall(researchPrompt, researchTools, fs);

    if (summary && summary.trim()) {
      logger.log('RESEARCH_PHASE_COMPLETE', { summaryLength: summary.length });

      let context = '\n\n**Research Phase Results:**\n';
      context += 'A research agent analyzed the codebase before you. Here is what it found. ';
      context += 'Use this context to avoid re-reading these files. Start implementing immediately.\n\n';
      context += summary;
      return context;
    }
  } catch (err: any) {
    console.error('[Research] Research phase failed:', err.message);
    // Non-fatal — main agent proceeds without research context
  }

  return '';
}
