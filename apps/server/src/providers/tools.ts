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
  }
];
