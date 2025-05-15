import * as fs from 'fs';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { ProjectStructure } from '../analyzer/project-structure';
import { ConfigFileOptions, GraphOptions } from '../types/command-options';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';
import { HtmlGeneratorPreact } from '../visualizer/html-renderer';

/**
 * Generates HTML format graph
 */
async function generateHtmlGraph(
  projectStructure: ProjectStructure,
  reachableNodeIds: Set<string>,
  unusedFiles: string[],
  projectRoot: string,
  outputPath?: string,
): Promise<void> {
  const htmlGenerator = new HtmlGeneratorPreact(projectStructure, reachableNodeIds, unusedFiles);
  const htmlContent = await htmlGenerator.generate({
    title: path.basename(projectRoot) + ' 依赖可视化',
  });

  const filePath = outputPath || path.resolve(process.cwd(), 'mp-lens-graph.html');
  writeOutputToFile(htmlContent, filePath);
  logger.info(`✅ 依赖图已保存至: ${filePath}`);
}

/**
 * Generates JSON format graph
 */
function generateJsonGraph(projectStructure: ProjectStructure, outputPath?: string): void {
  const jsonContent = JSON.stringify(projectStructure, null, 2);

  const filePath = outputPath || path.resolve(process.cwd(), 'mp-lens-graph.json');
  writeOutputToFile(jsonContent, filePath);
  logger.info(`✅ 依赖图 JSON 已保存至: ${filePath}`);
}

/**
 * Writes content to file, creating directories if needed
 */
function writeOutputToFile(content: string, filePath: string): void {
  try {
    const outputDir = path.dirname(filePath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(filePath, content);
  } catch (writeError) {
    logger.error(`保存依赖图到 ${filePath} 失败: ${(writeError as Error).message}`);
    throw writeError;
  }
}

/**
 * 生成项目依赖图
 */
export async function graph(rawOptions: GraphOptions): Promise<void> {
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
  const mergedConfig: GraphOptions & ConfigFileOptions = context.mergedConfig as GraphOptions &
    ConfigFileOptions;

  // === Extract Graph-Specific Options (Now correctly typed) ===
  const format = mergedConfig.format ?? 'html';
  const output = mergedConfig.output;

  // === Handle Output Path (Graph Specific) ===
  let outputPathAbsolute: string | undefined = undefined;
  if (output) {
    outputPathAbsolute = path.isAbsolute(output) ? output : path.resolve(process.cwd(), output);
    logger.info(`已解析输出路径: ${outputPathAbsolute}`);
  }

  // === Log Graph-Specific Options ===
  logger.info(`输出格式: ${format}`);
  // Note: Common path logging is done in initializeCommandContext
  if (outputPathAbsolute) logger.info(`输出文件: ${outputPathAbsolute}`);

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

    // Generate output based on format
    if (format === 'html') {
      await generateHtmlGraph(
        projectStructure,
        reachableNodeIds,
        unusedFiles,
        projectRoot,
        outputPathAbsolute,
      );
    } else if (format === 'json') {
      generateJsonGraph(projectStructure, outputPathAbsolute);
    } else {
      throw new Error(`不支持的输出格式: ${format}`);
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
