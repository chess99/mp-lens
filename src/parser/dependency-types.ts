import type { LinkType } from '../analyzer/project-structure';

export type DependencyKind =
  | 'script'
  | 'config'
  | 'component'
  | 'template'
  | 'style'
  | 'resource'
  | 'worker';

export interface ParsedDependency {
  sourceFile: string;
  rawPath: string;
  kind: DependencyKind;
  declaredBy?: string;
}

export interface ResolvedDependency extends ParsedDependency {
  targetFile: string;
  linkType: LinkType;
}

export function linkTypeForDependencyKind(kind: DependencyKind): LinkType {
  switch (kind) {
    case 'config':
    case 'component':
      return 'Config';
    case 'template':
      return 'Template';
    case 'style':
      return 'Style';
    case 'resource':
      return 'Resource';
    case 'worker':
      return 'WorkerEntry';
    case 'script':
    default:
      return 'Import';
  }
}
