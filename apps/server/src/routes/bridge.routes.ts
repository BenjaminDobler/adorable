/**
 * Internal Tool Bridge API
 *
 * Called by the Adorable MCP server (a separate process spawned by Claude Code)
 * to access Adorable's stateful services: Figma bridge, skills, kit lessons.
 *
 * Desktop mode only. Secured via a shared bridge token.
 */
import { Router } from 'express';
import { figmaBridge } from '../services/figma-bridge.service';
import { SkillRegistry } from '../providers/skills/skill-registry';
import { DiskFileSystem } from '../providers/filesystem/disk-filesystem';
import { prisma } from '../db/prisma';

const router = Router();

// ── Token authentication middleware ──────────────────────────────────

function requireBridgeToken(req: any, res: any, next: any) {
  const expectedToken = process.env['ADORABLE_BRIDGE_TOKEN'];
  if (!expectedToken) {
    return res.status(503).json({ error: 'Bridge not configured' });
  }
  const provided = req.headers['x-bridge-token'];
  if (provided !== expectedToken) {
    return res.status(401).json({ error: 'Invalid bridge token' });
  }
  next();
}

router.use(requireBridgeToken);

// ── Figma Bridge ─────────────────────────────────────────────────────

router.post('/figma/:action', async (req: any, res) => {
  const { action } = req.params;
  const userId = req.body.userId || req.headers['x-user-id'];

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  if (!figmaBridge.isConnected(userId)) {
    return res.status(503).json({ error: 'Figma bridge not connected' });
  }

  try {
    const command = { action, ...req.body };
    delete command.userId; // Don't pass userId inside the command
    const result = await figmaBridge.sendCommand(userId, command);
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Figma command failed' });
  }
});

// ── Skills ───────────────────────────────────────────────────────────

router.post('/skill/activate', async (req: any, res) => {
  const { skillName, projectPath, userId } = req.body;
  if (!skillName || !projectPath) {
    return res.status(400).json({ error: 'skillName and projectPath required' });
  }

  try {
    const registry = new SkillRegistry();
    const fs = new DiskFileSystem(projectPath);
    await registry.discover(fs, userId);
    const skill = registry.getSkill(skillName);

    if (!skill) {
      return res.status(404).json({ error: `Skill "${skillName}" not found` });
    }

    res.json({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      references: skill.references || [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Skill activation failed' });
  }
});

router.post('/skill/read-reference', async (req: any, res) => {
  const { skillName, filename, projectPath, userId } = req.body;
  if (!skillName || !filename || !projectPath) {
    return res.status(400).json({ error: 'skillName, filename, and projectPath required' });
  }

  try {
    const registry = new SkillRegistry();
    const fs = new DiskFileSystem(projectPath);
    await registry.discover(fs, userId);
    const skill = registry.getSkill(skillName);

    if (!skill) {
      return res.status(404).json({ error: `Skill "${skillName}" not found` });
    }

    const ref = skill.references?.find(r => r.name === filename || r.path.endsWith(filename));
    if (!ref) {
      return res.status(404).json({ error: `Reference "${filename}" not found in skill "${skillName}"` });
    }

    res.json({ content: ref.content });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to read skill reference' });
  }
});

// ── Kit Lessons ──────────────────────────────────────────────────────

router.post('/lesson/save', async (req: any, res) => {
  const { kitId, userId, component, title, problem, solution, codeSnippet, tags, projectId } = req.body;
  if (!kitId || !userId || !title || !problem || !solution) {
    return res.status(400).json({ error: 'kitId, userId, title, problem, and solution required' });
  }

  try {
    const lesson = await prisma.kitLesson.create({
      data: {
        kitId,
        userId,
        component,
        title,
        problem,
        solution,
        codeSnippet,
        tags,
        projectId,
      },
    });
    res.json({ id: lesson.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save lesson' });
  }
});

// ── Status ───────────────────────────────────────────────────────────

router.get('/status', async (req: any, res) => {
  const userId = req.headers['x-user-id'] as string;
  const agentPort = process.env['ADORABLE_AGENT_PORT'] || '3334';

  // Check CDP availability
  let cdpAvailable = false;
  try {
    const cdpRes = await fetch(`http://localhost:${agentPort}/api/native/cdp/status`);
    const cdpData = await cdpRes.json();
    cdpAvailable = cdpData.available === true;
  } catch {
    // CDP not available
  }

  // Check Figma bridge
  const figmaConnected = userId ? figmaBridge.isConnected(userId) : false;

  res.json({ cdpAvailable, figmaConnected });
});

export { router as bridgeRouter };
