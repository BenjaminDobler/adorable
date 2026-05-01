import { Tool } from '../types';
import { kitLessonService } from '../../../services/kit-lesson.service';

export const saveLesson: Tool = {
  definition: {
    name: 'save_lesson',
    description: 'Save a lesson learned about a component library pattern, gotcha, or workaround. Call this AFTER you fix a build error caused by incorrect kit component usage (wrong import path, wrong selector, missing wrapper, etc.) or when you discover a non-obvious pattern through trial and error. The lesson is persisted and injected into future sessions so the same mistake is never repeated. Do NOT save trivial issues like typos.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short, specific summary (e.g., "Table sortable columns need [lxSortable] directive, not [sortable]")' },
        component: { type: 'string', description: 'Primary component name involved' },
        problem: { type: 'string', description: 'What went wrong — the error, incorrect assumption, or confusing behavior' },
        solution: { type: 'string', description: 'The correct approach — what actually works and why' },
        code_snippet: { type: 'string', description: 'Minimal example code showing the correct usage' },
        tags: { type: 'string', description: 'Comma-separated tags (e.g., "import, selector, layout")' }
      },
      required: ['title', 'problem', 'solution']
    },
  },

  async execute(args, ctx) {
    if (!ctx.activeKitId || !ctx.userId) {
      return { content: 'Error: save_lesson requires an active kit and authenticated user.', isError: true };
    }

    try {
      const lesson = await kitLessonService.create({
        kitId: ctx.activeKitId,
        userId: ctx.userId,
        title: args.title,
        problem: args.problem,
        solution: args.solution,
        component: args.component || undefined,
        codeSnippet: args.code_snippet || undefined,
        tags: args.tags || undefined,
        projectId: ctx.projectId || undefined,
      });
      return { content: `Lesson saved: "${lesson.title}". This will be available in future sessions with this kit.`, isError: false };
    } catch (err: any) {
      return { content: `Failed to save lesson: ${err.message}`, isError: true };
    }
  }
};
