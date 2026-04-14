import { Tool } from '../types';
import { validateToolArgs } from '../utils';
import { questionManager } from '../../question-manager';

export const askUser: Tool = {
  definition: {
    name: 'ask_user',
    description: 'Ask the user clarifying questions when requirements are unclear or you need to make a decision that would significantly impact implementation. Supports multiple question types: radio, checkbox, text, color, range, image, and code. Use sparingly - only when genuinely uncertain.',
    input_schema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: 'Array of questions to ask the user.',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique identifier for this question (e.g., "styling_preference", "feature_scope").'
              },
              text: {
                type: 'string',
                description: 'The question text to display to the user.'
              },
              type: {
                type: 'string',
                enum: ['radio', 'checkbox', 'text', 'color', 'range', 'image', 'code'],
                description: 'Question type: radio (single choice), checkbox (multi choice), text (free-form), color (color picker), range (numeric slider), image (asset selector), code (code input).'
              },
              options: {
                type: 'array',
                description: 'Options for radio/checkbox/image questions.',
                items: {
                  type: 'object',
                  properties: {
                    value: { type: 'string', description: 'The value to return if selected.' },
                    label: { type: 'string', description: 'The label to display to the user.' },
                    recommended: { type: 'boolean', description: 'Mark this option as recommended. Shows "(Recommended)" label.' },
                    preview: { type: 'string', description: 'For image type: URL or path to preview image.' }
                  },
                  required: ['value', 'label']
                }
              },
              placeholder: {
                type: 'string',
                description: 'Placeholder text for text/code input questions.'
              },
              required: {
                type: 'boolean',
                description: 'Whether the question must be answered. Default is false.'
              },
              default: {
                description: 'Default/pre-selected value. For radio: string. For checkbox: array. For text/color/code: string. For range: number.'
              },
              min: {
                type: 'number',
                description: 'For range type: minimum value.'
              },
              max: {
                type: 'number',
                description: 'For range type: maximum value.'
              },
              step: {
                type: 'number',
                description: 'For range type: step increment. Default is 1.'
              },
              unit: {
                type: 'string',
                description: 'For range type: unit label to display (e.g., "px", "%", "rem").'
              },
              language: {
                type: 'string',
                description: 'For code type: programming language for syntax hints (e.g., "typescript", "json", "css").'
              },
              allowUpload: {
                type: 'boolean',
                description: 'For image type: allow user to upload a new image. Default is false (only select from project assets).'
              }
            },
            required: ['id', 'text', 'type']
          }
        },
        context: {
          type: 'string',
          description: 'Brief context explaining why you are asking these questions.'
        }
      },
      required: ['questions']
    },
  },

  async execute(args, ctx) {
    const { callbacks } = ctx;

    if (!callbacks.onQuestionRequest) {
      return { content: 'Question requests are not available in this environment.', isError: true };
    }

    const error = validateToolArgs('ask_user', args, ['questions']);
    if (error) return { content: error, isError: true };

    try {
      const answers = await questionManager.requestAnswers(
        args.questions,
        args.context,
        (requestId, questions, context) => callbacks.onQuestionRequest!(requestId, questions, context)
      );
      return { content: `User provided the following answers:\n${JSON.stringify(answers, null, 2)}`, isError: false };
    } catch (err: any) {
      return { content: `Question request failed: ${err.message}`, isError: true };
    }
  }
};
