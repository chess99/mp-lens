import * as path from 'path';

/**
 * 生成 Page/Component 节点的 id 和 label
 * @param type 'Page' | 'Component'
 * @param basePath 绝对路径
 * @param miniappRoot miniapp 根目录
 */
export function getNodeIdAndLabel(
  type: 'Page' | 'Component',
  basePath: string,
  miniappRoot: string,
): { id: string; label: string } {
  const rel = path.relative(miniappRoot, basePath).replace(/\\/g, '/');
  return {
    id: type === 'Page' ? `page:${rel}` : `comp:${rel}`,
    label: rel,
  };
}
