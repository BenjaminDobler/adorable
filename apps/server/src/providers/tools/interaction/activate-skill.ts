import { Tool } from '../types';
import { validateToolArgs } from '../utils';

export const activateSkill: Tool = {
  definition: {
    name: 'activate_skill',
    description: 'Activates a specialized agent skill.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the skill to activate.'
        }
      },
      required: ['name']
    },
  },

  async execute(args, ctx) {
    const error = validateToolArgs('activate_skill', args, ['name']);
    if (error) return { content: error, isError: true };

    const { skillRegistry } = ctx;
    const skill = skillRegistry.getSkill(args.name);
    if (skill) {
      let skillContent = skill.instructions;
      if (skill.references && skill.references.length > 0) {
        skillContent += '\n\n[SKILL REFERENCE FILES - available on demand]\nUse the `read_skill_reference` tool to read any of these files when needed:\n' +
          skill.references.map(r => `- ${r.name}`).join('\n');
      }
      const content = `<activated_skill name="${skill.name}">\n${skillContent}\n</activated_skill>`;
      return { content, isError: false };
    } else {
      return { content: `Error: Skill '${args.name}' not found.`, isError: true };
    }
  }
};

export const readSkillReference: Tool = {
  definition: {
    name: 'read_skill_reference',
    description: 'Read a specific reference file from an activated skill. Use this after activating a skill to load reference documentation on demand.',
    input_schema: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          description: 'The name of the skill.'
        },
        filename: {
          type: 'string',
          description: 'The filename of the reference file to read (as listed after skill activation).'
        }
      },
      required: ['skill_name', 'filename']
    },
  },

  async execute(args, ctx) {
    const error = validateToolArgs('read_skill_reference', args, ['skill_name', 'filename']);
    if (error) return { content: error, isError: true };

    const { skillRegistry } = ctx;
    const skill = skillRegistry.getSkill(args.skill_name);
    if (!skill) {
      return { content: `Error: Skill '${args.skill_name}' not found.`, isError: true };
    }

    const ref = skill.references?.find(r => r.name === args.filename);
    if (!ref) {
      return { content: `Error: Reference file '${args.filename}' not found in skill '${args.skill_name}'.`, isError: true };
    }

    return { content: `### ${ref.name}\n${ref.content}`, isError: false };
  }
};
