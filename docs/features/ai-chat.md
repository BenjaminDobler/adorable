# AI Chat

The AI Chat is the primary way to build and modify your app in Adorable. Describe what you want in natural language and the AI writes the code.

## How It Works

1. Type your instruction in the chat input at the bottom of the panel
2. The AI analyzes your project, determines which files to create or modify, and streams the changes
3. The preview updates in real time as files are written

## What You Can Ask

- **Create features:** "Add a contact form with name, email, and message fields"
- **Modify styles:** "Make the header sticky and add a shadow"
- **Fix bugs:** "The login button doesn't redirect after successful login"
- **Refactor:** "Split this component into smaller components"
- **Explain:** "How does the routing work in this project?"

## File Snapshots

Each AI message captures a snapshot of all project files at that point. You can use the [Versions](versions.md) panel to go back to any previous message's state.

## Context

The AI has access to:

- All files in your project
- The current preview state
- Any screenshots or annotations you attach
- Your conversation history

## Tips

- Be specific: "Change the primary button color to #3B82F6" works better than "make it look nicer"
- Attach screenshots or use annotations to point at exactly what you want changed
- The AI can run terminal commands (install packages, run scripts) when needed
- Long-running generations can be stopped with the stop button
