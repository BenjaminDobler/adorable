/**
 * Kit Lesson Service
 *
 * CRUD operations for kit lessons (lessons learned).
 * Lessons capture non-obvious patterns, workarounds, and gotchas
 * discovered during AI generation sessions with component kits.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { prisma } from '../db/prisma';
import { KITS_DIR } from '../config';

export interface CreateLessonData {
  kitId: string;
  userId: string;
  title: string;
  problem: string;
  solution: string;
  component?: string;
  codeSnippet?: string;
  tags?: string;
  projectId?: string;
  scope?: 'user' | 'kit';
}

export interface UpdateLessonData {
  title?: string;
  problem?: string;
  solution?: string;
  component?: string;
  codeSnippet?: string;
  tags?: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

class KitLessonService {
  private getLessonsDir(kitId: string): string {
    return path.join(KITS_DIR, kitId, '.adorable', 'lessons');
  }

  /**
   * Create a new lesson in DB and generate the .md file on disk.
   */
  async create(data: CreateLessonData) {
    const lesson = await prisma.kitLesson.create({
      data: {
        kitId: data.kitId,
        userId: data.userId,
        title: data.title,
        problem: data.problem,
        solution: data.solution,
        component: data.component || null,
        codeSnippet: data.codeSnippet || null,
        tags: data.tags || null,
        projectId: data.projectId || null,
        scope: data.scope || 'user',
      },
    });

    // Generate .md file on disk
    await this.writeLessonFile(data.kitId, lesson.id, lesson);

    return lesson;
  }

  /**
   * Get all lessons for a kit, optionally filtered by scope and/or user.
   */
  async getByKit(kitId: string, opts?: { scope?: 'user' | 'kit'; userId?: string }) {
    const where: any = { kitId };
    if (opts?.scope) {
      where.scope = opts.scope;
    }
    if (opts?.userId && opts?.scope === 'user') {
      where.userId = opts.userId;
    }

    return prisma.kitLesson.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get lessons visible to a specific user for a kit:
   * all kit-scoped lessons + the user's personal lessons.
   */
  async getVisibleLessons(kitId: string, userId: string) {
    return prisma.kitLesson.findMany({
      where: {
        kitId,
        OR: [
          { scope: 'kit' },
          { scope: 'user', userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single lesson by ID.
   */
  async getById(lessonId: string) {
    return prisma.kitLesson.findUnique({ where: { id: lessonId } });
  }

  /**
   * Update a lesson.
   */
  async update(lessonId: string, data: UpdateLessonData) {
    const lesson = await prisma.kitLesson.update({
      where: { id: lessonId },
      data,
    });

    // Regenerate .md file
    await this.writeLessonFile(lesson.kitId, lesson.id, lesson);

    return lesson;
  }

  /**
   * Promote a lesson from user scope to kit scope.
   */
  async promote(lessonId: string) {
    const lesson = await prisma.kitLesson.update({
      where: { id: lessonId },
      data: { scope: 'kit' },
    });

    // Regenerate .md file
    await this.writeLessonFile(lesson.kitId, lesson.id, lesson);

    return lesson;
  }

  /**
   * Delete a lesson from DB and remove .md file.
   */
  async delete(lessonId: string) {
    const lesson = await prisma.kitLesson.findUnique({ where: { id: lessonId } });
    if (!lesson) return false;

    await prisma.kitLesson.delete({ where: { id: lessonId } });

    // Remove .md file
    try {
      const filePath = this.getLessonFilePath(lesson.kitId, lesson.id, lesson.title);
      await fs.unlink(filePath);
    } catch {
      // File may not exist
    }

    return true;
  }

  /**
   * Generate a compact summary of lessons for prompt injection.
   * Returns a string with ~1-2 lines per lesson, capped at maxLessons.
   */
  async generateLessonSummary(kitId: string, userId: string, maxLessons = 20): Promise<string | null> {
    const lessons = await this.getVisibleLessons(kitId, userId);
    if (lessons.length === 0) return null;

    const capped = lessons.slice(0, maxLessons);
    const lines = capped.map(l => {
      const comp = l.component ? `${l.component}: ` : '';
      const slug = slugify(l.title);
      return `- ${comp}${l.title} (see .adorable/lessons/${l.id}-${slug}.md)`;
    });

    return lines.join('\n');
  }

  /**
   * Write a lesson .md file to disk.
   */
  private async writeLessonFile(kitId: string, lessonId: string, lesson: any) {
    const lessonsDir = this.getLessonsDir(kitId);
    await fs.mkdir(lessonsDir, { recursive: true });

    const slug = slugify(lesson.title);
    const filePath = path.join(lessonsDir, `${lessonId}-${slug}.md`);

    let content = `# ${lesson.title}\n\n`;
    if (lesson.component) {
      content += `**Component:** ${lesson.component}\n`;
    }
    if (lesson.tags) {
      content += `**Tags:** ${lesson.tags}\n`;
    }
    content += `\n## Problem\n${lesson.problem}\n`;
    content += `\n## Solution\n${lesson.solution}\n`;

    if (lesson.codeSnippet) {
      content += `\n## Example\n\`\`\`\n${lesson.codeSnippet}\n\`\`\`\n`;
    }

    await fs.writeFile(filePath, content, 'utf-8');
  }

  private getLessonFilePath(kitId: string, lessonId: string, title: string): string {
    const slug = slugify(title);
    return path.join(this.getLessonsDir(kitId), `${lessonId}-${slug}.md`);
  }
}

export const kitLessonService = new KitLessonService();
