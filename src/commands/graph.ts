import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { ProjectStructure } from '../analyzer/project-structure';
import { CommandOptions } from '../types/command-options';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';
import { isString } from '../utils/options-merger';
import { DotGenerator } from '../visualizer/dot-generator';
import { HtmlGeneratorPreact } from '../visualizer/html-renderer';

// Define the shape of the raw options passed from cli.ts
interface RawGraphOptions {
  // Global
  project: string;
  verbose?: boolean;
  verboseLevel?: number;
  config?: string;
  miniappRoot?: string;
  entryFile?: string;
  trace?: boolean;

  // Command specific
  format?: 'html' | 'dot' | 'json' | 'png' | 'svg';
  output?: string;
  depth?: number;
  focus?: string;
  npm?: boolean;

  [key: string]: any;
}

// Define GraphOptions
interface GraphOptions extends CommandOptions {
  format?: 'html' | 'dot' | 'json' | 'png' | 'svg';
  output?: string;
  depth?: number;
  focus?: string;
  npm?: boolean;
  miniappRoot?: string;
  entryFile?: string;
  // Allow any config file options to be present after merge
  [key: string]: any;
}

// Function to render JSON format
function renderJSON(structure: ProjectStructure): string {
  // Simple serialization for now. Could be enhanced later (e.g., remove redundant paths).
  return JSON.stringify(structure, null, 2);
}

/**
 * 生成项目依赖图
 */
export async function graph(rawOptions: RawGraphOptions): Promise<void> {
  const context = await initializeCommandContext(rawOptions, 'graph');
  const {
    projectRoot,
    verbose,
    verboseLevel,
    miniappRoot,
    entryFile,
    exclude,
    essentialFilesList,
    fileTypes,
    includeAssets,
  } = context;
  // Use the specific GraphOptions type for mergedConfig
  const mergedConfig: GraphOptions = context.mergedConfig as GraphOptions;

  // === Extract Graph-Specific Options (Now correctly typed) ===
  const format = mergedConfig.format ?? 'html';
  const depth = mergedConfig.depth;
  const focus = mergedConfig.focus;
  const npm = mergedConfig.npm ?? false;
  const output = mergedConfig.output;

  // === Handle Output Path (Graph Specific) ===
  let outputPathAbsolute = null;
  if (output) {
    outputPathAbsolute = path.isAbsolute(output) ? output : path.resolve(process.cwd(), output);
    logger.info(`已解析输出路径: ${outputPathAbsolute}`);
  }

  // === Log Graph-Specific Options ===
  logger.info(`输出格式: ${format}`);
  // Note: Common path logging is done in initializeCommandContext
  if (outputPathAbsolute) logger.info(`输出文件: ${outputPathAbsolute}`);
  if (depth !== undefined) logger.info(`最大深度: ${depth}`);
  if (focus) logger.info(`聚焦文件: ${focus}`);
  if (npm) logger.info('包含 npm 依赖');

  try {
    logger.info('正在分析项目依赖...');
    // No need to recalculate fileTypes

    // Call analyzeProject with options from context
    const { projectStructure, reachableNodeIds, unusedFiles } = await analyzeProject(projectRoot, {
      fileTypes,
      excludePatterns: exclude,
      essentialFiles: essentialFilesList,
      verbose,
      verboseLevel,
      miniappRoot,
      entryFile,
      entryContent: mergedConfig.entryContent, // Correctly typed access
      includeAssets,
    });

    logger.info('正在渲染依赖图...');

    // Pass data to generators
    const htmlGenerator = new HtmlGeneratorPreact(projectStructure, reachableNodeIds, unusedFiles);
    const dotGenerator = new DotGenerator(projectStructure);

    // Call appropriate renderer with depth and focus parameters
    let outputContent: string | Buffer = ''; // Use Buffer for potential binary formats
    switch (format) {
      case 'html':
        outputContent = await htmlGenerator.generate({
          title: path.basename(projectRoot) + ' 依赖可视化',
          maxDepth: depth,
          focusNode: focus,
        });
        break;
      case 'dot':
        outputContent = dotGenerator.generate({
          title: '项目依赖图',
          maxDepth: depth,
          focusNode: focus,
        });
        break;
      case 'json':
        logger.warn('JSON 输出目前不支持深度/聚焦过滤。将输出完整结构。');
        outputContent = renderJSON(projectStructure);
        break;
      case 'svg':
      case 'png':
        outputContent = dotGenerator.generate({
          title: '项目依赖图',
          maxDepth: depth,
          focusNode: focus,
        });
        logger.warn(
          chalk.yellow(`格式 '${format}' 需要安装 Graphviz才能转换 DOT 输出。正在保存 DOT 内容。`),
        );
        if (isString(output) && (output.endsWith('.png') || output.endsWith('.svg'))) {
          logger.warn(`输出文件将包含 DOT 内容，而不是 ${format.toUpperCase()} 图像。`);
        }
        break;
      default:
        throw new Error(`不支持的输出格式: ${format}`);
    }

    // Handle output (Now consistent for all text-based formats)
    if (outputPathAbsolute) {
      const outputDir = path.dirname(outputPathAbsolute);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      // Ensure outputContent is string or buffer before writing
      if (typeof outputContent === 'string' || Buffer.isBuffer(outputContent)) {
        fs.writeFileSync(outputPathAbsolute, outputContent);
        logger.info(`✅ 依赖图已保存到: ${outputPathAbsolute}`);
      } else {
        // This case should ideally not happen with current formats
        logger.error(`内部错误: format ${format} 的 outputContent 不可写`);
      }
    } else {
      // Handle console output OR default HTML file saving
      if (format === 'html') {
        // Default behavior: Save HTML to mp-lens-graph.html in CWD if --output is not specified
        const defaultHtmlPath = path.resolve(process.cwd(), 'mp-lens-graph.html');
        try {
          // Ensure outputContent is string before writing
          if (typeof outputContent === 'string') {
            const outputDir = path.dirname(defaultHtmlPath);
            if (!fs.existsSync(outputDir)) {
              // This case is unlikely for CWD, but good practice
              fs.mkdirSync(outputDir, { recursive: true });
            }
            fs.writeFileSync(defaultHtmlPath, outputContent);
            logger.info(`✅ 依赖图已保存至: ${defaultHtmlPath}`);
          } else {
            logger.error('内部错误: HTML outputContent 不是字符串。');
          }
        } catch (writeError) {
          logger.error(
            `保存默认 HTML 依赖图到 ${defaultHtmlPath} 失败: ${(writeError as Error).message}`,
          );
        }
      } else if (typeof outputContent === 'string') {
        // Default behavior for other text formats: print to console
        console.log(outputContent);
      } else {
        // Handle binary formats like potential future image generation
        logger.warn(`无法将格式 '${format}' 的二进制数据输出到控制台。请使用 --output。`);
      }
    }
  } catch (error) {
    logger.error(`依赖图生成失败: ${(error as Error).message}`);
    const stack = (error as Error).stack;
    if (stack) {
      logger.debug(stack);
    }
    throw error;
  }
}
