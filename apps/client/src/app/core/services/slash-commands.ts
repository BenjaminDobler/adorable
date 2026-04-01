import { Injectable } from '@angular/core';
import { Skill } from './skills';

export interface SlashCommandItem {
  id: string;
  type: 'action' | 'model' | 'skill' | 'project';
  label: string;
  description: string;
  icon?: string;
  data?: any;
}

export interface ProjectCommand {
  name: string;
  content: string;
  hasArguments: boolean;
}

const BUILT_IN_COMMANDS: SlashCommandItem[] = [
  { id: 'model', type: 'action', label: '/model', description: 'Switch AI model', icon: 'model' },
  { id: 'plan', type: 'action', label: '/plan', description: 'Toggle plan mode', icon: 'plan' },
  { id: 'compact', type: 'action', label: '/compact', description: 'Toggle compact tool output', icon: 'compact' },
  { id: 'clear', type: 'action', label: '/clear', description: 'Clear conversation context', icon: 'clear' },
  { id: 'debug:context', type: 'action', label: '/debug:context', description: 'Preview the full context sent to the AI', icon: 'debug' },
];

@Injectable({ providedIn: 'root' })
export class SlashCommandService {

  buildCommandList(skills: Skill[], projectCommands: ProjectCommand[]): SlashCommandItem[] {
    const commands: SlashCommandItem[] = [...BUILT_IN_COMMANDS];

    for (const skill of skills) {
      commands.push({
        id: `skill:${skill.name}`,
        type: 'skill',
        label: `/skill:${skill.name}`,
        description: skill.description || 'Custom skill',
        data: skill
      });
    }

    for (const cmd of projectCommands) {
      commands.push({
        id: `project:${cmd.name}`,
        type: 'project',
        label: `/project:${cmd.name}`,
        description: cmd.hasArguments ? 'Project command (accepts arguments)' : 'Project command',
        data: cmd
      });
    }

    return commands;
  }

  filter(commands: SlashCommandItem[], query: string): SlashCommandItem[] {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter(cmd => cmd.label.toLowerCase().startsWith('/' + lower));
  }
}
