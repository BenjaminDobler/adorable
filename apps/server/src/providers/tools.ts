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
    name: 'write_files',
    description: 'Creates or updates MULTIPLE files at once. Use this instead of write_file when you need to create several files — it is much faster.',
    input_schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'Array of files to write.',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The full path to the file, relative to the project root.'
              },
              content: {
                type: 'string',
                description: 'The full content of the file.'
              }
            },
            required: ['path', 'content']
          }
        }
      },
      required: ['files']
    }
  },
  {
    name: 'read_file',
    description: 'Reads the content of a single file. Prefer read_files when you need to read multiple files.',
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
    name: 'read_files',
    description: 'Reads MULTIPLE files at once. Use this instead of read_file when you need to inspect several files — it is much faster.',
    input_schema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          description: 'Array of file paths to read.',
          items: {
            type: 'string'
          }
        }
      },
      required: ['paths']
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
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the project. Cannot delete critical config files (package.json, angular.json, tsconfig.json).',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to delete.'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'rename_file',
    description: 'Rename or move a file to a new path within the project.',
    input_schema: {
      type: 'object',
      properties: {
        old_path: {
          type: 'string',
          description: 'The current path of the file.'
        },
        new_path: {
          type: 'string',
          description: 'The new path for the file.'
        }
      },
      required: ['old_path', 'new_path']
    }
  },
  {
    name: 'copy_file',
    description: 'Copy a file to a new location within the project.',
    input_schema: {
      type: 'object',
      properties: {
        source_path: {
          type: 'string',
          description: 'The path of the file to copy.'
        },
        destination_path: {
          type: 'string',
          description: 'The destination path for the copy.'
        }
      },
      required: ['source_path', 'destination_path']
    }
  },
  {
    name: 'take_screenshot',
    description: 'Capture a screenshot of the running application preview. Use this to visually verify your changes, check layout issues, or see runtime errors. Returns an image you can analyze.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];
