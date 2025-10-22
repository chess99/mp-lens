import * as path from 'path';

/**
 * Normalizes a given absolute path by removing the file extension and any trailing '/index'.
 * This creates a canonical base path for a component or page.
 * e.g., /path/to/comp/index.wxml -> /path/to/comp
 * e.g., /path/to/page.json -> /path/to/page
 * @param absolutePath The absolute file path.
 * @returns The canonical absolute base path.
 */
function getCanonicalBasePath(absolutePath: string): string {
  // Regex to remove common miniprogram extensions
  let basePath = absolutePath.replace(/\.(wxml|wxss|less|js|ts|json)$/, '');

  const indexSuffix = path.sep + 'index';
  if (basePath.endsWith(indexSuffix)) {
    basePath = basePath.slice(0, -indexSuffix.length);
  }
  return basePath;
}

/**
 * Generates a canonical node ID and label from a file's absolute path.
 * The ID is prefixed and relative to the miniapp root, ensuring uniqueness and consistency.
 * @param type The type of the node ('Page' or 'Component').
 * @param absolutePath The absolute path to one of the entity's files (e.g., .wxml, .json).
 * @param miniappRoot The absolute path to the miniapp root directory.
 * @returns An object containing the canonical id and label.
 */
export function generateNodeIdAndLabel(
  type: 'Page' | 'Component',
  absolutePath: string,
  miniappRoot: string,
): { id: string; label: string } {
  const canonicalBasePath = getCanonicalBasePath(absolutePath);
  const relativePath = path.relative(miniappRoot, canonicalBasePath).replace(/\\/g, '/');
  const prefix = type === 'Page' ? 'page:' : 'comp:';

  return {
    id: `${prefix}${relativePath}`,
    label: relativePath,
  };
}
