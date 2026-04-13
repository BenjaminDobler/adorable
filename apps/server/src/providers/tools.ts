export const SAVE_LESSON_TOOL = {
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
  }
};

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
    description: 'Make a precise edit to a file. PREREQUISITE: You MUST call read_file/read_files on this file first. old_str must match the exact current content.',
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

/**
 * CDP (Chrome DevTools Protocol) tools — available when running in desktop mode
 * with a preview running (docked webview or undocked window). These give the AI
 * agent direct access to inspect, interact with, and debug the running application.
 */
export const CDP_TOOLS = [
  {
    name: 'browse_screenshot',
    description: 'Capture a screenshot of the running application preview via Chrome DevTools Protocol. Returns a base64 JPEG image. By default, screenshots are resized to max 1280x800 to save tokens. For high-fidelity comparisons (e.g. Figma designs), set fullResolution to true.',
    input_schema: {
      type: 'object',
      properties: {
        fullResolution: {
          type: 'boolean',
          description: 'If true, return the screenshot at native display resolution without resizing. Use for pixel-perfect comparisons with design mockups. Default false.'
        },
        quality: {
          type: 'number',
          description: 'JPEG quality (1-100). Higher = better quality but larger image. Default 80.'
        }
      },
      required: []
    }
  },
  {
    name: 'browse_evaluate',
    description: 'Execute JavaScript in the application preview via Chrome DevTools Protocol. Use to inspect DOM state, read computed styles, check variable values, debug runtime issues, or query the page. The expression is evaluated in the page context.',
    input_schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'JavaScript expression to evaluate in the preview page context. Can use await for async operations.'
        }
      },
      required: ['expression']
    }
  },
  {
    name: 'browse_accessibility',
    description: 'Get the accessibility tree of the preview page. Returns a structured view of all accessible elements with their roles, names, and descriptions. Useful for checking ARIA compliance, understanding page structure, and verifying semantic HTML.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'browse_console',
    description: 'Read buffered console messages (log, warn, error) from the preview. Returns messages since last read. Use this to check for runtime errors, warnings, or debug output.',
    input_schema: {
      type: 'object',
      properties: {
        clear: {
          type: 'boolean',
          description: 'Clear the buffer after reading. Defaults to true.'
        }
      },
      required: []
    }
  },
  {
    name: 'browse_navigate',
    description: 'Navigate the preview to a specific URL or route path. Use to test different routes/pages in the application.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to. Can be a full URL or a path relative to the dev server.'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'browse_click',
    description: 'Click at specific coordinates in the preview page. Use after taking a screenshot to interact with visible elements.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in pixels from the left edge.' },
        y: { type: 'number', description: 'Y coordinate in pixels from the top edge.' }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'inspect_component',
    description: 'Inspect the Angular component tree or get details for a specific component. Without a selector, returns the full component tree built from ONG annotations. With a selector, returns detailed info including inputs, outputs, properties, directives, and source location.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS selector or _ong ID to get details for a specific component. If omitted, returns the full component tree.'
        }
      },
      required: []
    }
  },
  {
    name: 'inspect_performance',
    description: 'Profile Angular change detection performance. Use action "start" to begin recording, "stop" to stop and return collected data. Returns timing data for each change detection cycle and per-component breakdown.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'stop'],
          description: 'Whether to start or stop profiling.'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'inspect_routes',
    description: 'Get the current Angular route configuration and active route. Returns the route tree with paths, components, guards, lazy-loading indicators, and which route is currently active.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'inspect_signals',
    description: 'Get the Angular signal dependency graph. Returns signal, computed, and effect nodes with their dependency edges. Requires Angular 19+ with signal graph debug APIs.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'inspect_errors',
    description: 'Parse the last build output into structured error objects. Returns an array of { file, line, column, code, message, severity } for each error/warning. Much easier to work with than raw build output.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'inspect_styles',
    description: 'Get computed CSS styles for an element in the preview. Returns key layout and visual properties (display, position, width, height, margin, padding, color, background, opacity, visibility, overflow, z-index, flex, grid). Use to debug why elements are invisible, misaligned, or incorrectly sized.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to inspect (e.g., ".header", "#main", "app-navbar").'
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'inspect_network',
    description: 'Get recent network requests from the preview. Returns requests with URL, method, status, duration, and response size. Use action "start" to begin capturing, "get" to retrieve captured requests, "clear" to reset.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'get', 'clear'],
          description: 'Action to perform: "start" enables network monitoring, "get" returns captured requests, "clear" resets the buffer.'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'type_text',
    description: 'Type text into the currently focused element in the preview. Use after browse_click to focus an input field, then type_text to enter content. Supports special keys like Enter, Tab, Escape, Backspace.',
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to type. For special keys use: {Enter}, {Tab}, {Escape}, {Backspace}, {ArrowUp}, {ArrowDown}, {ArrowLeft}, {ArrowRight}.'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'inspect_dom',
    description: 'Get the HTML content of a specific element in the preview. Returns the outer HTML of the matched element, useful for understanding DOM structure without writing JS.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element (e.g., "main", ".content", "app-root").'
        },
        depth: {
          type: 'number',
          description: 'Maximum depth of child elements to include. Default 3. Use 0 for just the element itself, -1 for full depth.'
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'measure_element',
    description: 'Get the position, dimensions, and visibility of an element in the preview. Returns bounding box (x, y, width, height), whether it is visible, and scroll position. Use for debugging layout issues.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to measure.'
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'clear_build_cache',
    description: 'Clear Angular and Nx build caches (.angular/cache, .nx/cache, node_modules/.cache). Use when encountering phantom build errors that persist despite correct code.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_container_logs',
    description: 'Get recent dev server logs from the container/native process. Returns the last N lines of build output, HMR status, and server messages. Useful for debugging dev server crashes or configuration issues.',
    input_schema: {
      type: 'object',
      properties: {
        lines: {
          type: 'number',
          description: 'Number of recent log lines to return. Default 50.'
        }
      },
      required: []
    }
  },
  {
    name: 'inject_css',
    description: 'Inject temporary CSS into the preview for rapid visual prototyping. The CSS is not persisted to files — it only affects the current preview session. Use to test style changes before committing them. Use action "add" to inject, "clear" to remove all injected styles.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'clear'],
          description: 'Action: "add" to inject CSS, "clear" to remove all injected styles.'
        },
        css: {
          type: 'string',
          description: 'The CSS rules to inject (only for "add" action).'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'get_bundle_stats',
    description: 'Get the bundle size breakdown from the last build. Returns initial and lazy chunk sizes. Use to identify large bundles, check if lazy loading is working, or verify tree-shaking.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

export const FIGMA_TOOLS = [
  {
    name: 'figma_get_selection',
    description: 'Get the current selection in the connected Figma file. Returns the node structure (names, types, bounding boxes, visual properties) as JSON — NO images. Use figma_export_node separately to get a visual reference. For large selections, use figma_get_node with depth parameter to fetch sections incrementally.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'figma_get_node',
    description: 'Get the structure of a specific Figma node by its ID. Returns the node tree with visual properties (fills, strokes, effects, dimensions). Optionally includes a PNG export.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'The Figma node ID (e.g., "1:23").'
        },
        includeImage: {
          type: 'boolean',
          description: 'Also export the node as a PNG image. Default true.'
        }
      },
      required: ['nodeId']
    }
  },
  {
    name: 'figma_export_node',
    description: 'Export a Figma node as PNG or SVG. Use PNG for visual comparison. Use SVG (format: "SVG") for logos, illustrations, and vector graphics that should be inlined in code — this produces clean, scalable markup instead of a raster image.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'The Figma node ID to export.'
        },
        format: {
          type: 'string',
          enum: ['PNG', 'SVG'],
          description: 'Export format. Use "SVG" for logos and vector assets to inline in code. Default "PNG".'
        },
        scale: {
          type: 'number',
          description: 'Export scale for PNG (1-4). Default 2. Ignored for SVG.'
        }
      },
      required: ['nodeId']
    }
  },
  {
    name: 'figma_select_node',
    description: 'Select a node in Figma and scroll/zoom it into view. Use to highlight matching elements or show the user which design element you are implementing.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'The Figma node ID to select.'
        }
      },
      required: ['nodeId']
    }
  },
  {
    name: 'figma_search_nodes',
    description: 'Search for nodes in the current Figma page by name. Returns matching node IDs, names, types, and dimensions (up to 50 results). Use to find specific design elements.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to match against node names (case-insensitive partial match).'
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional filter by node types (e.g., ["FRAME", "COMPONENT", "TEXT"]).'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'figma_get_fonts',
    description: 'Get all fonts used in the current Figma page. Returns font families, styles/weights, whether each is an icon font, Unicode codepoint samples for icon fonts, CDN URLs, and — critically — the correct CSS font-family name and font-weight to use in code (which often differs from Figma\'s internal name). ALWAYS call this before generating code from a Figma design.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'figma_get_variables',
    description: 'Extract design tokens (Figma local variables) from the connected file. Returns collections, modes, and tokens with resolved values per mode. Colors are resolved to #hex/rgba(), variable aliases are followed. Use to get exact design token values for theme files.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];
