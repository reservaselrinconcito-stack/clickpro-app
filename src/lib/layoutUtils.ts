import type { TemplateBlock, TemplateBlockType } from '../../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Normalizes a layout array which may contain strings or TemplateBlock objects.
 * This ensures that rendering logic (Preview/PDF) can always assume an object
 * with a .type property.
 *
 * Legacy templates stored layout items as plain strings (block type names).
 * New templates store full TemplateBlock objects. This function handles both.
 */
export const normalizeLayout = (
  layout: (string | TemplateBlock)[] | undefined,
): TemplateBlock[] => {
  if (!layout) return [];

  return layout.map(item => {
    if (typeof item === 'string') {
      // Legacy string format — promote to full block object
      return {
        id:   uuidv4(),
        type: item as TemplateBlockType,
      } satisfies TemplateBlock;
    }
    // Already a block object — ensure it has an id
    return item.id ? item : { ...item, id: uuidv4() };
  });
};
