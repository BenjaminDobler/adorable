import { Tool } from '../types';

export const inspectErrors: Tool = {
  definition: {
    name: 'inspect_errors',
    description: 'Parse the last build output into structured error objects. Returns an array of { file, line, column, code, message, severity } for each error/warning. Much easier to work with than raw build output.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const lastOutput = ctx.lastBuildOutput || '';
    const errors: any[] = [];
    // Match Angular/TypeScript error patterns: file:line:col - error TSxxxx: message
    const errorRegex = /([^\s]+\.(?:ts|html|scss|css)):(\d+):(\d+)\s*-\s*(error|warning)\s*(TS\d+|NG\d+)?:?\s*(.*)/g;
    let match;
    while ((match = errorRegex.exec(lastOutput)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        severity: match[4],
        code: match[5] || '',
        message: match[6].trim(),
      });
    }
    if (errors.length > 0) {
      return { content: JSON.stringify(errors, null, 2), isError: false };
    } else {
      const content = lastOutput
        ? 'No structured errors found in build output. Raw output:\n' + lastOutput.substring(0, 2000)
        : 'No build output available. Run verify_build first.';
      return { content, isError: false };
    }
  }
};
