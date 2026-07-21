import * as path from 'path';

type PathImplementation = Pick<typeof path, 'isAbsolute' | 'relative' | 'sep'>;

export function isPathWithinRoot(
  root: string,
  filePath: string,
  pathImplementation: PathImplementation = path,
): boolean {
  const relativePath = pathImplementation.relative(root, filePath);

  return (
    relativePath === '' ||
    (!pathImplementation.isAbsolute(relativePath) &&
      relativePath !== '..' &&
      !relativePath.startsWith(`..${pathImplementation.sep}`))
  );
}
