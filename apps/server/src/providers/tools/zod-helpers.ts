/**
 * Zod helpers for tool schema definitions.
 *
 * Provides zodToToolSchema() for converting Zod schemas to JSON schemas
 * compatible with the LLM tool calling API, plus semantic transformers
 * that handle the common ways LLMs malform typed parameters.
 */
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Convert a Zod schema to a JSON schema suitable for tool input_schema.
 * Strips the $schema and additionalProperties fields that the LLM API doesn't need.
 */
export function zodToToolSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, { target: 'openApi3' }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

/**
 * Semantic number: accepts number, string-encoded number, or undefined.
 * LLMs sometimes send "10" instead of 10.
 */
export function semanticNumber(description: string) {
  return z.union([z.number(), z.string()])
    .transform((v) => {
      if (typeof v === 'number') return v;
      const n = parseFloat(v);
      return isNaN(n) ? undefined : n;
    })
    .optional()
    .describe(description);
}

/**
 * Semantic boolean: accepts boolean, string boolean, or number.
 * LLMs sometimes send "true"/"false", "yes"/"no", 0/1.
 */
export function semanticBoolean(description: string) {
  return z.union([z.boolean(), z.string(), z.number()])
    .transform((v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      return ['true', 'yes', '1', 'on'].includes(String(v).toLowerCase());
    })
    .optional()
    .describe(description);
}
