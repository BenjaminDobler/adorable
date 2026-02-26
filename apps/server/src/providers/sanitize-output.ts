/**
 * Sanitizes raw command output before sending it to the LLM as a tool result.
 * Strips ANSI codes, progress noise, collapses duplicates, and truncates to save tokens.
 */

// ── 1. Strip ANSI escape sequences ──────────────────────────────────────────

function stripAnsi(text: string): string {
  // Covers SGR, OSC, CSI sequences, and carriage returns
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')   // CSI sequences (e.g. \x1b[31m)
    .replace(/\x1b\][^\x07]*\x07/g, '')       // OSC sequences
    .replace(/\x1b\][^\x1b]*\x1b\\/g, '')     // OSC with ST terminator
    .replace(/\r/g, '');
}

// ── 2. Remove progress / spinner / noisy lines ──────────────────────────────

const PROGRESS_PATTERNS = [
  /^\s*\[([#=\->.]+\s*)\]\s*/,           // [####    ] or [===>    ]
  /^\s*\d{1,3}%\s/,                       // 65% ...
  /^npm timing\b/,                         // npm timing lines
  /^npm http\b/,                           // npm http fetch/request
  /^npm WARN deprecated\b/,               // keep deprecations separately handled below
  /^\s*⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/,           // braille spinners
  /^\s*[-\\|/]\s+(Compiling|Building|Bundling|Optimizing|Generating)/i,  // spinner + action
];

const KEEP_PATTERNS = [
  /error/i,
  /warn/i,
  /ERR!/,
  /failed/i,
  /deprecated/i,
  /vulnerabilit/i,
];

function shouldKeepLine(line: string): boolean {
  return KEEP_PATTERNS.some(p => p.test(line));
}

function removeProgressLines(text: string): string {
  return text
    .split('\n')
    .filter(line => {
      if (shouldKeepLine(line)) return true;
      return !PROGRESS_PATTERNS.some(p => p.test(line));
    })
    .join('\n');
}

// ── 3. Command-specific summarization ───────────────────────────────────────

function isNpmInstall(command: string): boolean {
  return /npm\s+(install|ci|i)\b/.test(command);
}

function isBuildCommand(command: string): boolean {
  return /\b(build|ng build|npm run build|npx.*build)\b/.test(command);
}

function summarizeNpmInstall(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Keep summary line (added N packages)
    if (/^added \d+ package/.test(trimmed)) { kept.push(line); continue; }
    // Keep audit/vulnerability summary
    if (/vulnerabilit/i.test(trimmed)) { kept.push(line); continue; }
    // Keep warnings and deprecations
    if (/warn/i.test(trimmed) || /deprecated/i.test(trimmed)) { kept.push(line); continue; }
    // Keep npm ERR! lines
    if (/ERR!/i.test(trimmed)) { kept.push(line); continue; }
    // Keep "up to date" line
    if (/up to date/.test(trimmed)) { kept.push(line); continue; }
  }

  return kept.join('\n');
}

function summarizeBuildOutput(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Keep warnings and errors
    if (/warn|error|ERR!/i.test(trimmed)) { kept.push(line); continue; }
    // Keep bundle size / chunk lines (e.g. "Initial chunk files | ...")
    if (/chunk|bundle|\.js\s+\d/i.test(trimmed)) { kept.push(line); continue; }
    // Keep completion summary lines
    if (/build (succeeded|completed|done|failed)/i.test(trimmed)) { kept.push(line); continue; }
    if (/successfully compiled/i.test(trimmed)) { kept.push(line); continue; }
    if (/output size/i.test(trimmed)) { kept.push(line); continue; }
    // Keep total / timing lines
    if (/total:/i.test(trimmed) || /time:/i.test(trimmed)) { kept.push(line); continue; }
    // Keep Application bundle lines (Angular CLI output)
    if (/application bundle/i.test(trimmed)) { kept.push(line); continue; }
  }

  // Also keep last 3 non-empty lines from original (often contain the final status)
  const nonEmpty = lines.filter(l => l.trim());
  const lastThree = nonEmpty.slice(-3);
  for (const line of lastThree) {
    if (!kept.includes(line)) kept.push(line);
  }

  return kept.join('\n');
}

function commandSpecificSummarize(command: string, stdout: string, stderr: string, exitCode: number): { stdout: string; stderr: string } {
  // On failure, keep everything so the LLM can diagnose
  if (exitCode !== 0) return { stdout, stderr };

  if (isNpmInstall(command)) {
    return { stdout: summarizeNpmInstall(stdout), stderr: summarizeNpmInstall(stderr) };
  }

  if (isBuildCommand(command)) {
    return { stdout: summarizeBuildOutput(stdout), stderr: summarizeBuildOutput(stderr) };
  }

  // Other commands: pass through
  return { stdout, stderr };
}

// ── 4. Collapse repeated lines ──────────────────────────────────────────────

function normalizeDigits(text: string): string {
  return text.replace(/\d+/g, 'N');
}

function collapseRepeatedLines(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let prevNormalized = '';
  let repeatCount = 0;
  let firstLine = '';

  for (const line of lines) {
    const normalized = normalizeDigits(line.trim());
    if (normalized === prevNormalized && normalized !== '') {
      repeatCount++;
    } else {
      if (repeatCount >= 2) {
        result.push(`... (repeated ${repeatCount} more times)`);
      }
      result.push(line);
      firstLine = line;
      prevNormalized = normalized;
      repeatCount = 0;
    }
  }
  // Flush trailing repeats
  if (repeatCount >= 2) {
    result.push(`... (repeated ${repeatCount} more times)`);
  }

  return result.join('\n');
}

// ── 5. Truncate output ──────────────────────────────────────────────────────

function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const headSize = Math.floor(maxChars * 0.6);
  const tailSize = maxChars - headSize;
  const removed = text.length - headSize - tailSize;

  return (
    text.slice(0, headSize) +
    `\n--- [truncated ${removed} chars] ---\n` +
    text.slice(text.length - tailSize)
  );
}

// ── 6. Main exported function ───────────────────────────────────────────────

const STDOUT_MAX = 6000;
const STDERR_MAX = 4000;

export function sanitizeCommandOutput(
  command: string,
  stdout: string,
  stderr: string,
  exitCode: number
): string {
  // Pipeline: strip ANSI → remove progress → command-specific summarize → collapse repeats → truncate
  let cleanStdout = stripAnsi(stdout || '');
  let cleanStderr = stripAnsi(stderr || '');

  cleanStdout = removeProgressLines(cleanStdout);
  cleanStderr = removeProgressLines(cleanStderr);

  const summarized = commandSpecificSummarize(command, cleanStdout, cleanStderr, exitCode);
  cleanStdout = summarized.stdout;
  cleanStderr = summarized.stderr;

  cleanStdout = collapseRepeatedLines(cleanStdout);
  cleanStderr = collapseRepeatedLines(cleanStderr);

  cleanStdout = truncateOutput(cleanStdout.trim(), STDOUT_MAX);
  cleanStderr = truncateOutput(cleanStderr.trim(), STDERR_MAX);

  // Assemble final output, omitting empty sections
  const parts: string[] = [`Exit Code: ${exitCode}`];
  if (cleanStdout) parts.push(`\nSTDOUT:\n${cleanStdout}`);
  if (cleanStderr) parts.push(`\nSTDERR:\n${cleanStderr}`);

  return parts.join('\n');
}
