/**
 * Text Transformation Utilities
 *
 * Utilities for transforming text content, including command references
 * and general-purpose transformer composition.
 */

/**
 * Text transformer function signature.
 */
export type TextTransformer = (text: string) => string;

/**
 * Transforms colon-based command references to hyphen-based format.
 * Converts `/opsx:` patterns to `/opsx-` for tools that use hyphen syntax.
 *
 * @param text - The text containing command references
 * @returns Text with command references transformed to hyphen format
 *
 * @example
 * transformToHyphenCommands('/opsx:new') // returns '/opsx-new'
 * transformToHyphenCommands('Use /opsx:apply to implement') // returns 'Use /opsx-apply to implement'
 */
export function transformToHyphenCommands(text: string): string {
  return text.replace(/\/opsx:/g, '/opsx-');
}

/**
 * Composes multiple transformers into a single transformer.
 * Transformers are applied left-to-right.
 *
 * @param transformers - Array of transformer functions (undefined values are skipped)
 * @returns A composed transformer, or undefined if no valid transformers provided
 *
 * @example
 * const transformer = composeTransformers(specsPathTransformer, hyphenTransformer);
 * const result = transformer?.('some text') ?? 'some text';
 */
export function composeTransformers(
  ...transformers: Array<TextTransformer | undefined>
): TextTransformer | undefined {
  const validTransformers = transformers.filter(
    (t): t is TextTransformer => t !== undefined
  );

  if (validTransformers.length === 0) {
    return undefined;
  }

  return (text: string) =>
    validTransformers.reduce((result, transformer) => transformer(result), text);
}
