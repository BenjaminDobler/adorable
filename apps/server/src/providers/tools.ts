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
  },
  {
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
    }
  }
];
