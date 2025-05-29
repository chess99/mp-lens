/**
 * Parsers for extracting dependencies from various Mini Program file types.
 * These functions can be used as custom compilers for knip.
 *
 * @see https://knip.dev/features/compilers
 */

/**
 * Parse WXML files for dependencies
 * Extracts imports from image sources, template imports, includes, and WXS modules.
 */
export function parseWxml(text: string, _filePath: string): string {
  const results: string[] = [];
  try {
    const normalizePath = (p: string): string => {
      if (
        !p ||
        p.startsWith('/') ||
        p.startsWith('./') ||
        p.startsWith('../') ||
        /^(http|https|data):/.test(p)
      ) {
        return p;
      }
      return './' + p;
    };

    // Match image sources
    const imgRegex = /<image[^>]+src=["']([^"']+)["']/g;
    let match: RegExpExecArray | null = imgRegex.exec(text);
    while (match) {
      const rawPath = match[1];
      if (rawPath && rawPath.includes('{{')) {
        match = imgRegex.exec(text);
        continue;
      }
      const normalized = normalizePath(rawPath);
      if (normalized && !/^(data|http|https):/.test(normalized)) {
        results.push(`import '${normalized}'`);
      }
      match = imgRegex.exec(text);
    }

    // Match template imports
    const importRegex = /<import\s+src=["']([^"']+)["']/g;
    match = importRegex.exec(text);
    while (match) {
      const rawPath = match[1];
      const normalized = normalizePath(rawPath);
      if (normalized) {
        results.push(`import '${normalized}'`);
      }
      match = importRegex.exec(text);
    }

    // Match template includes
    const includeRegex = /<include\s+src=["']([^"']+)["']/g;
    match = includeRegex.exec(text);
    while (match) {
      const rawPath = match[1];
      const normalized = normalizePath(rawPath);
      if (normalized) {
        results.push(`import '${normalized}'`);
      }
      match = includeRegex.exec(text);
    }

    // Match WXS module imports
    const wxsRegex = /<wxs\s+src=["']([^"']+)["']/g;
    match = wxsRegex.exec(text);
    while (match) {
      const rawPath = match[1];
      const normalized = normalizePath(rawPath);
      if (normalized) {
        results.push(`import '${normalized}'`);
      }
      match = wxsRegex.exec(text);
    }

    return results.join('\n');
  } catch {
    return '';
  }
}

/**
 * Parse WXSS files for dependencies
 * Extracts style imports using @import statements.
 */
export function parseWxss(text: string, _filePath: string): string {
  const results: string[] = [];
  try {
    // Match style imports
    const importRegex = /@import\s+["']([^"']+)["']/g;
    let match: RegExpExecArray | null = importRegex.exec(text);
    while (match) {
      results.push(`@import '${match[1]}'`);
      match = importRegex.exec(text);
    }

    return results.join('\n');
  } catch {
    return '';
  }
}

/**
 * Parse WXS files for dependencies
 * Extracts require statements that reference other modules.
 */
export function parseWxs(text: string, _filePath: string): string {
  const results: string[] = [];
  try {
    // Match require statements
    const requireRegex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match: RegExpExecArray | null = requireRegex.exec(text);
    while (match) {
      results.push(`import '${match[1]}'`);
      match = requireRegex.exec(text);
    }

    return results.join('\n');
  } catch {
    return '';
  }
}

// We don't parse JSON files in the compiler because:
// 1. When a component path is referenced (e.g. "./foobar"), we can't determine if it's:
//    - "./foobar.json" (single file) or
//    - "./foobar/index.json" (directory)
// 2. The only purpose of this JSON compiler is to make getCompilerExtensions include
//    JSON files as project files, so they can be analyzed for usage
export function parseJson(text: string): string {
  return text;
}
