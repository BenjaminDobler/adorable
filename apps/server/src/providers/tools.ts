export const TOOLS = [
  {
    name: 'write_file',
    description: 'Creates or updates a file in the project.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The full path to the file, relative to the project root (e.g., "src/app/app.component.ts").'
        },
        content: {
          type: 'string',
          description: 'The full content of the file.'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'read_file',
    description: 'Reads the content of a file from the project to understand its context before editing.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to read.'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'list_dir',
    description: 'Lists the files and folders in a directory to explore the project structure.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to list.'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'edit_file',
    description: 'Make a precise edit to a file by replacing a unique string.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to edit.'
        },
        old_str: {
          type: 'string',
          description: 'The exact string to find (must be unique in the file).'
        },
        new_str: {
          type: 'string',
          description: 'The string to replace it with.'
        }
      },
      required: ['path', 'old_str', 'new_str']
    }
  },
  {
    name: 'glob',
    description: 'Find files matching a pattern',
    input_schema: {
        type: 'object',
        properties: {
            pattern: {
              type: 'string', 
              description: 'Glob pattern (e.g., "**/*.ts")'
            }
        },
        required: ['pattern']
    }
  },
  {
    name: 'grep',
    description: 'Search for a string or pattern in files',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { 
          type: 'string', 
          description: 'The string or regex pattern to search for.' 
        },
        path: { 
          type: 'string', 
          description: 'The path to search in (directory or file). Defaults to root.' 
        },
        case_sensitive: { 
          type: 'boolean', 
          description: 'Whether the search is case sensitive.' 
        }
      },
      required: ['pattern']
    }
  }
];
