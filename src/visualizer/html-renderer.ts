import { ProjectStructure } from '../analyzer/project-structure';
// import { TreeNodeData } from '../ui/types'; // No longer needed here
import { AssetResolver } from '../utils/asset-resolver';
// import { logger } from '../utils/debug-logger'; // Potentially remove if not used elsewhere

/**
 * HtmlGenerator选项
 */
export interface HtmlGeneratorOptions {
  title: string;
  maxDepth?: number; // This option might become UI-specific
  focusNode?: string; // This option might become UI-specific
}

/**
 * Generates a static HTML file with embedded data and pre-built UI assets.
 */
export class HtmlGeneratorPreact {
  private structure: ProjectStructure;
  // private reachableNodeIds: Set<string>; // No longer directly used here for tree building
  private unusedFiles: string[];

  constructor(structure: ProjectStructure, reachableNodeIds: Set<string>, unusedFiles: string[]) {
    this.structure = structure;
    // this.reachableNodeIds = reachableNodeIds; // No longer directly used here for tree building
    this.unusedFiles = unusedFiles;
  }

  /**
   * Generates the static HTML page.
   */
  async generate(options: HtmlGeneratorOptions): Promise<string> {
    // 1. 定义资源文件的相对路径
    const jsAssetRelative = 'assets/main.js';
    const cssAssetRelative = 'assets/style.css';

    // 2. 使用AssetResolver获取资源内容
    const jsContent =
      AssetResolver.getJsAsset(jsAssetRelative) || 'console.error("无法加载UI资源");';
    const cssContent = AssetResolver.getCssAsset(cssAssetRelative) || '/* 无法加载样式 */';

    // 3. 准备数据
    // 完整结构数据（用于图形视图）
    const graphDataJson = JSON.stringify(this.structure).replace(/</g, '\\u003c');
    // Prepare unused files data
    const unusedFilesJson = JSON.stringify(this.unusedFiles).replace(/</g, '\\u003c');

    // 4. 定义HTML模板
    const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title || '依赖可视化'}</title>
  <style>
    ${cssContent}
    body { margin: 0; font-family: sans-serif; background-color: #f8f9fa; color: #212529; }
    #app { padding: 20px; }
  </style>
</head>
<body>
  <div id="app"><noscript>You need to enable JavaScript to run this app.</noscript></div>
  <script>
    // Embed full graph data for DependencyGraph component
    window.__MP_LENS_GRAPH_DATA__ = ${graphDataJson};
    // Embed unused files list
    window.__MP_LENS_UNUSED_FILES__ = ${unusedFilesJson};
    // Set title for UI components
    window.__MP_LENS_TITLE__ = "${options.title || '依赖可视化'}";
  </script>
  <script type="module">
    ${jsContent}
  </script>
</body>
</html>`;

    return htmlTemplate;
  }

  // All tree-specific generation methods (prepareAndConvertData,
  // filterStructureByFocus, convertGraphToTreeInternal) are removed.
}
