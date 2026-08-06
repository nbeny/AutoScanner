import { z } from 'zod';

/**
 * Field kinds emitted by {@link describeScannerInput}. The frontend maps each
 * kind to a concrete control (checkbox, number input, select, chips, …).
 */
export type ScannerFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'string[]'
  | 'number[]'
  | 'enum[]'
  | 'unknown';

/**
 * A single option of a scanner's Zod `inputSchema`, flattened into a shape the
 * UI can render generically. `required` is false when the field is
 * `.optional()` or carries a `.default()`.
 */
export interface ScannerFieldDescriptor {
  name: string;
  type: ScannerFieldType;
  required: boolean;
  /** Default from `.default(...)`, or `undefined` when the field has none. */
  default: unknown;
  min: number | null;
  max: number | null;
  enumValues: string[] | null;
  description: string | null;
}

interface Unwrapped {
  base: z.ZodTypeAny;
  hasDefault: boolean;
  isOptional: boolean;
  defaultValue: unknown;
  description: string | null;
}

interface ZodDefLike {
  typeName?: string;
  description?: string;
  innerType?: z.ZodTypeAny;
  defaultValue?: () => unknown;
  checks?: Array<{ kind: string; value: number }>;
  values?: string[];
  type?: z.ZodTypeAny;
}

function defOf(schema: z.ZodTypeAny): ZodDefLike {
  return ((schema?._def ?? {}) as ZodDefLike) ?? {};
}

/** Peel `ZodDefault` / `ZodOptional` / `ZodNullable` wrappers off a schema. */
function unwrap(schema: z.ZodTypeAny): Unwrapped {
  let current = schema;
  let hasDefault = false;
  let isOptional = false;
  let defaultValue: unknown;
  let description: string | null = null;

  while (current && current._def) {
    const def = defOf(current);
    if (description === null && typeof def.description === 'string') {
      description = def.description;
    }
    if (def.typeName === 'ZodDefault') {
      hasDefault = true;
      const fn = def.defaultValue;
      try {
        defaultValue = typeof fn === 'function' ? fn() : undefined;
      } catch {
        defaultValue = undefined;
      }
      current = def.innerType as z.ZodTypeAny;
    } else if (def.typeName === 'ZodOptional' || def.typeName === 'ZodNullable') {
      isOptional = true;
      current = def.innerType as z.ZodTypeAny;
    } else {
      break;
    }
  }

  return { base: current, hasDefault, isOptional, defaultValue, description };
}

function numberBounds(schema: z.ZodTypeAny): { min: number | null; max: number | null } {
  const checks = defOf(schema).checks ?? [];
  let min: number | null = null;
  let max: number | null = null;
  for (const check of checks) {
    if (check.kind === 'min') min = check.value;
    if (check.kind === 'max') max = check.value;
  }
  return { min, max };
}

function enumValues(schema: z.ZodTypeAny): string[] | null {
  const values = defOf(schema).values;
  return Array.isArray(values) ? [...values] : null;
}

function classify(base: z.ZodTypeAny): {
  type: ScannerFieldType;
  min: number | null;
  max: number | null;
  enumValues: string[] | null;
} {
  const typeName = defOf(base).typeName;

  switch (typeName) {
    case 'ZodString':
      return { type: 'string', min: null, max: null, enumValues: null };
    case 'ZodBoolean':
      return { type: 'boolean', min: null, max: null, enumValues: null };
    case 'ZodNumber': {
      const { min, max } = numberBounds(base);
      return { type: 'number', min, max, enumValues: null };
    }
    case 'ZodEnum':
      return { type: 'enum', min: null, max: null, enumValues: enumValues(base) };
    case 'ZodArray': {
      const element = unwrap(defOf(base).type as z.ZodTypeAny).base;
      const elementName = defOf(element).typeName;
      if (elementName === 'ZodString')
        return { type: 'string[]', min: null, max: null, enumValues: null };
      if (elementName === 'ZodNumber')
        return { type: 'number[]', min: null, max: null, enumValues: null };
      if (elementName === 'ZodEnum')
        return { type: 'enum[]', min: null, max: null, enumValues: enumValues(element) };
      return { type: 'unknown', min: null, max: null, enumValues: null };
    }
    default:
      return { type: 'unknown', min: null, max: null, enumValues: null };
  }
}

/**
 * Flatten a scanner's Zod `inputSchema` into a list of field descriptors the
 * frontend can render as a form. Non-object schemas (e.g. `z.object({})` for
 * credential-only scanners like shodan) yield an empty list.
 */
export function describeScannerInput(
  schema: z.ZodType<unknown, z.ZodTypeDef, unknown>,
): ScannerFieldDescriptor[] {
  const { base } = unwrap(schema as z.ZodTypeAny);
  if (defOf(base).typeName !== 'ZodObject') return [];

  const shape = (base as z.ZodObject<z.ZodRawShape>).shape;
  const fields: ScannerFieldDescriptor[] = [];

  for (const [name, rawField] of Object.entries(shape)) {
    const {
      base: fieldBase,
      hasDefault,
      isOptional,
      defaultValue,
      description,
    } = unwrap(rawField as z.ZodTypeAny);
    const classified = classify(fieldBase);
    fields.push({
      name,
      type: classified.type,
      required: !hasDefault && !isOptional,
      default: hasDefault ? defaultValue : undefined,
      min: classified.min,
      max: classified.max,
      enumValues: classified.enumValues,
      description,
    });
  }

  return fields;
}
