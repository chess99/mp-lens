import * as fs from 'fs';
import * as path from 'path';
import { ProjectStructure } from '../../analyzer/project-structure';
import { logger } from '../../utils/debug-logger';
import { HtmlGeneratorPreact } from '../../visualizer/html-renderer';

/**
 * Generates HTML format graph
 */
export async function generateHtmlGraph(
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
export function generateJsonGraph(projectStructure: ProjectStructure, outputPath?: string): void {
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
