import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeProject } from '../../analyzer/analyzer';
import { CmdLintOptions, GlobalCliOptions } from '../../types/command-options';
import { initializeCommandContext } from '../../utils/command-init';
import { logger } from '../../utils/debug-logger';
import { HandledError } from '../../utils/errors';
import { generateNodeIdAndLabel } from '../../utils/id-helper';
import { PathResolver } from '../../utils/path-resolver';
import { analyzeWxmlTags } from './analyzeWxmlTags';
import { lintComponentUsage } from './component-linter';
import { LintResult } from './types';

/**
 * Reads global components from app.json
 *
 * @param pathResolver PathResolver instance
 * @param miniappRoot Miniapp root directory
 * @returns Object with global component definitions
 */
async function readGlobalComponents(
  pathResolver: PathResolver,
  miniappRoot: string,
): Promise<Record<string, string>> {
  try {
    const appJsonPath = path.join(
      miniappRoot ? miniappRoot : pathResolver['projectRoot'],
      'app.json',
    );

    if (!fs.existsSync(appJsonPath)) {
      logger.warn('Could not find app.json in miniapp root');
      return {};
    }

    const appJsonContent = fs.readFileSync(appJsonPath, 'utf-8');
    const appJson = JSON.parse(appJsonContent);

    return appJson.usingComponents || {};
  } catch (err) {
    logger.warn(`Error reading global components: ${err}`);
    return {};
  }
}

// Define the context type for processFilePair
interface FilePairContext {
  wxmlPath: string;
  jsonPath: string;
  pathResolver: PathResolver;
  globalComponents: Record<string, string>;
  result: LintResult;
  miniappRoot: string; // absolute path
  projectRoot: string; // absolute path
}

/**
 * Processes a WXML/JSON file pair
 *
 * @param ctx FilePairContext object
 */
async function processFilePair(ctx: FilePairContext): Promise<void> {
  const { wxmlPath, jsonPath, pathResolver, globalComponents, result, miniappRoot } = ctx;
  try {
    logger.debug(`Processing file pair: ${wxmlPath} and ${jsonPath}`);
    result.summary.filesScanned++;
    // Analyze WXML tags
    const usedTagToFiles = await analyzeWxmlTags(wxmlPath, pathResolver);
    // Lint component usage
    const lintIssue = lintComponentUsage(wxmlPath, jsonPath, usedTagToFiles, globalComponents);

    // Read and parse JSON file to determine type and generate canonical ID
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    const jsonData = JSON.parse(jsonContent);
    const isComponent = jsonData.component === true;
    const type = isComponent ? 'Component' : 'Page';
    const { id } = generateNodeIdAndLabel(type, wxmlPath, miniappRoot);
    lintIssue.id = id;

    if (lintIssue.declaredNotUsed.length > 0 || lintIssue.usedNotDeclared.length > 0) {
      result.summary.filesWithIssues++;
      result.summary.declaredNotUsedCount += lintIssue.declaredNotUsed.length;
      result.summary.usedNotDeclaredCount += lintIssue.usedNotDeclared.length;
      result.issues.push(lintIssue);
    }
  } catch (err) {
    logger.error(`Error processing file pair: ${err}`);
  }
}

/**
 * Processes a directory to find all WXML/JSON file pairs
 *
 * @param dirPath Directory path
 * @param pathResolver PathResolver instance
 * @param globalComponents Global component definitions
 * @param result Result object to populate
 */
async function processDirectory(
  dirPath: string,
  pathResolver: PathResolver,
  globalComponents: Record<string, string>,
  result: LintResult,
  miniappRoot: string, // absolute path
  projectRoot: string, // absolute path
): Promise<void> {
  try {
    logger.info(`正在处理目录: ${dirPath}`);
    const files = fs.readdirSync(dirPath);
    const wxmlFiles = files.filter((file) => path.extname(file) === '.wxml');
    for (const wxmlFile of wxmlFiles) {
      const wxmlPath = path.join(dirPath, wxmlFile);
      const baseName = path.basename(wxmlFile, '.wxml');
      const jsonPath = path.join(dirPath, `${baseName}.json`);
      if (fs.existsSync(jsonPath)) {
        await processFilePair({
          wxmlPath,
          jsonPath,
          pathResolver,
          globalComponents,
          result,
          miniappRoot,
          projectRoot,
        });
      } else {
        logger.warn(`No corresponding JSON file found for ${wxmlPath}`);
      }
    }
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        await processDirectory(
          filePath,
          pathResolver,
          globalComponents,
          result,
          miniappRoot,
          projectRoot,
        );
      }
    }
  } catch (err) {
    logger.error(`Error processing directory ${dirPath}: ${err}`);
  }
}

/**
 * Processes a single file (WXML or JSON)
 *
 * @param filePath File path
 * @param pathResolver PathResolver instance
 * @param globalComponents Global component definitions
 * @param result Result object to populate
 */
async function processFile(
  filePath: string,
  pathResolver: PathResolver,
  globalComponents: Record<string, string>,
  result: LintResult,
  miniappRoot: string, // absolute path
  projectRoot: string, // absolute path
): Promise<void> {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const dirPath = path.dirname(filePath);
  let wxmlPath: string | null = null;
  let jsonPath: string | null = null;
  if (ext === '.wxml') {
    wxmlPath = filePath;
    jsonPath = path.join(dirPath, `${baseName}.json`);
  } else if (ext === '.json') {
    jsonPath = filePath;
    wxmlPath = path.join(dirPath, `${baseName}.wxml`);
  } else {
    throw new HandledError(`不支持的文件类型: ${filePath}. 只支持 .wxml 或 .json 文件。`);
  }
  if (!fs.existsSync(wxmlPath)) {
    throw new HandledError(`对应的 WXML 文件未找到: ${wxmlPath}`);
  }
  if (!fs.existsSync(jsonPath)) {
    throw new HandledError(`对应的 JSON 文件未找到: ${jsonPath}`);
  }
  await processFilePair({
    wxmlPath,
    jsonPath,
    pathResolver,
    globalComponents,
    result,
    miniappRoot,
    projectRoot,
  });
}

/**
 * Processes a specific target path (file or directory)
 *
 * @param targetPath Path to process
 * @param pathResolver PathResolver instance
 * @param globalComponents Global component definitions
 * @param result Result object to populate
 */
async function processTargetPath(
  targetPath: string,
  pathResolver: PathResolver,
  globalComponents: Record<string, string>,
  result: LintResult,
  miniappRoot: string, // absolute path
  projectRoot: string, // absolute path
): Promise<void> {
  // 直接将 targetPath 转为绝对路径
  const absTargetPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(process.cwd(), targetPath);

  if (!fs.existsSync(absTargetPath)) {
    throw new HandledError(`目标路径未找到: ${targetPath}`);
  }
  const stats = fs.statSync(absTargetPath);
  if (stats.isDirectory()) {
    await processDirectory(
      absTargetPath,
      pathResolver,
      globalComponents,
      result,
      miniappRoot,
      projectRoot,
    );
  } else {
    await processFile(
      absTargetPath,
      pathResolver,
      globalComponents,
      result,
      miniappRoot,
      projectRoot,
    );
  }
}

/**
 * Processes the entire miniapp project
 *
 * @param projectRoot Project root directory
 * @param options Analyzer options
 * @param pathResolver PathResolver instance
 * @param globalComponents Global component definitions
 * @param result Result object to populate
 */
async function processWholeProject(
  projectRoot: string,
  options: any,
  pathResolver: PathResolver,
  globalComponents: Record<string, string>,
  result: LintResult,
  miniappRoot: string, // absolute path
): Promise<void> {
  try {
    logger.info('正在处理整个项目...');
    const projectAnalysis = await analyzeProject(projectRoot, options);
    const nodes = projectAnalysis.projectStructure.nodes.filter(
      (node) => node.type === 'Page' || node.type === 'Component',
    );
    logger.info(`发现 ${nodes.length} 个页面/组件需要分析`);
    for (const node of nodes) {
      const basePath = node.properties?.basePath;
      if (!basePath) continue;

      let wxmlFilePath: string | undefined;
      let jsonFilePath: string | undefined;

      // Check for basePath.wxml
      const directWxmlPath = basePath + '.wxml';
      const directJsonPath = basePath + '.json';

      if (fs.existsSync(directWxmlPath) && fs.existsSync(directJsonPath)) {
        wxmlFilePath = directWxmlPath;
        jsonFilePath = directJsonPath;
      } else {
        // Check for basePath/index.wxml
        const indexWxmlPath = path.join(basePath, 'index.wxml');
        const indexJsonPath = path.join(basePath, 'index.json');
        if (fs.existsSync(indexWxmlPath) && fs.existsSync(indexJsonPath)) {
          wxmlFilePath = indexWxmlPath;
          jsonFilePath = indexJsonPath;
        }
      }

      if (wxmlFilePath && jsonFilePath) {
        await processFilePair({
          wxmlPath: wxmlFilePath,
          jsonPath: jsonFilePath,
          pathResolver,
          globalComponents,
          result,
          miniappRoot,
          projectRoot,
        });
      }
    }
  } catch (err) {
    logger.error(`Error processing whole project: ${err}`);
  }
}

/**
 * Generates a report based on the lint result
 *
 * @param result Lint result
 */
function generateReport(result: LintResult, miniappRoot?: string, projectRoot?: string): void {
  const sep = '─'.repeat(60);
  console.log('\n组件使用情况分析结果:');
  console.log('================================\n');

  if (result.issues.length === 0) {
    console.log(chalk.green('✓ 未发现问题。所有组件声明均与使用情况匹配。'));
  } else {
    for (const issue of result.issues) {
      // Print block header
      console.log(sep);
      console.log(issue.id || path.basename(issue.wxmlFile));
      console.log(sep + '\n');

      // Declared but not used (grouped by JSON file)
      if (issue.declaredNotUsed.length > 0) {
        const jsonPath = projectRoot ? path.relative(projectRoot, issue.jsonFile) : issue.jsonFile;
        console.log(jsonPath);
        console.log('  已在 JSON 中声明但在 WXML 中未使用:');
        for (const component of issue.declaredNotUsed) {
          console.log(chalk.yellow(`    - ${component.componentTag}`));
        }
        console.log('');
      }

      // Used but not declared - display issue at the specific WXML file where it occurs
      if (issue.usedNotDeclared.length > 0) {
        // Group tags by WXML file where they're used
        const fileToTags = new Map<string, string[]>();
        for (const component of issue.usedNotDeclared) {
          for (const file of component.usedIn) {
            if (!fileToTags.has(file)) {
              fileToTags.set(file, []);
            }
            fileToTags.get(file)!.push(component.componentTag);
          }
        }

        // Display each WXML file with its undeclared tags
        for (const [wxmlFile, tags] of fileToTags.entries()) {
          const wxmlPath = projectRoot ? path.relative(projectRoot, wxmlFile) : wxmlFile;
          console.log(wxmlPath);
          console.log('  已在 WXML 中使用但在 JSON 中未声明:');
          for (const tag of tags) {
            console.log(chalk.red(`    - ${tag}`));
          }
          console.log('');
        }
      }
    }
    // Summary
    console.log(chalk.blue('总结:'));
    console.log(chalk.blue(`  - 已扫描文件数: ${result.summary.filesScanned}`));
    console.log(chalk.blue(`  - 存在问题的文件数: ${result.summary.filesWithIssues}`));
    console.log(chalk.blue(`  - "已声明但未使用"总数: ${result.summary.declaredNotUsedCount}处`));
    console.log(chalk.blue(`  - "已使用但未声明"总数: ${result.summary.usedNotDeclaredCount}处`));
    // Tips
    console.log(chalk.cyan('\n解决建议:'));
    console.log(
      chalk.cyan(
        '  - 对于"已声明但未使用"的情况: 请从 .json 文件的 \'usingComponents\' 部分移除相应的组件条目。',
      ),
    );
    console.log(chalk.cyan('  - 对于"已使用但未声明"的情况:'));
    console.log(chalk.cyan('    1. 请检查 .wxml 中的标签是否拼写错误。'));
    console.log(
      chalk.cyan(
        "    2. 如果是有效的自定义组件, 请将其以正确的路径添加到 .json 文件的 'usingComponents' 中。",
      ),
    );
    console.log(chalk.cyan('    3. 如果您正在手动检查, 请确保您有一份全面的原生 WXML 标签列表。'));
  }
}

/**
 * Applies auto-fixes for "declared but not used" components based on lint results.
 *
 * @param result The lint result containing issues to fix.
 * @param projectRoot The absolute path to the project root.
 */
async function applyLintFixes(result: LintResult, projectRoot: string): Promise<void> {
  if (result.issues.length === 0) {
    logger.info('\n未发现问题，无需修复。');
    return;
  }

  logger.info('\n尝试自动修复"已声明但未使用"的组件...');
  let totalFilesModified = 0;
  let totalComponentsRemoved = 0;

  for (const issue of result.issues) {
    if (issue.declaredNotUsed.length > 0) {
      let jsonData;
      const jsonFilePath = issue.jsonFile;
      const relativeJsonPath = path.relative(projectRoot, jsonFilePath);

      try {
        const jsonContentStr = fs.readFileSync(jsonFilePath, 'utf-8');
        jsonData = JSON.parse(jsonContentStr);
      } catch (parseError: any) {
        logger.error(
          `Error parsing ${relativeJsonPath} for fix: ${parseError.message}. Skipping this file.`,
        );
        continue;
      }

      let modifiedInThisFile = false;
      let removalsInThisFile = 0;

      for (const compSpec of issue.declaredNotUsed) {
        const tagToRemove = compSpec.componentTag;
        let tagWasRemoved = false;

        if (
          jsonData.usingComponents &&
          Object.prototype.hasOwnProperty.call(jsonData.usingComponents, tagToRemove)
        ) {
          delete jsonData.usingComponents[tagToRemove];
          logger.info(
            `  [已修复] 已从 ${relativeJsonPath} 的 usingComponents 中移除 '${tagToRemove}'`,
          );
          tagWasRemoved = true;
        }

        if (
          jsonData.componentGenerics &&
          Object.prototype.hasOwnProperty.call(jsonData.componentGenerics, tagToRemove)
        ) {
          delete jsonData.componentGenerics[tagToRemove];
          if (!tagWasRemoved) {
            logger.info(
              `  [已修复] 已从 ${relativeJsonPath} 的 componentGenerics 中移除 '${tagToRemove}'`,
            );
          }
          tagWasRemoved = true;
        }

        if (tagWasRemoved) {
          removalsInThisFile++;
        }
      }

      if (removalsInThisFile > 0) {
        modifiedInThisFile = true;
        totalComponentsRemoved += removalsInThisFile;
      }

      if (modifiedInThisFile) {
        try {
          fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2) + '\n');
          totalFilesModified++;
        } catch (writeError: any) {
          logger.error(`Error writing fixes to ${relativeJsonPath}: ${writeError.message}`);
        }
      }
    }
  }

  if (totalComponentsRemoved > 0) {
    logger.info(
      `\n自动修复完成。在 ${totalFilesModified} 个文件中移除了 ${totalComponentsRemoved} 个未使用的组件引用。`,
    );
  } else {
    logger.info('\n未发现"已声明但未使用"的组件可供自动修复。');
  }
  logger.info('建议重新运行 lint 命令以验证更改并检查其他潜在问题。');
}

/**
 * Main lint command implementation (now uses initializeCommandContext)
 */
export async function lint(
  cliOptions: GlobalCliOptions,
  targetPath?: string, // 位置参数
  cmdOptions?: CmdLintOptions,
): Promise<void> {
  logger.info('开始组件使用情况检查流程...');
  const context = await initializeCommandContext(cliOptions);
  const { projectRoot, miniappRoot } = context;
  const aliasResolver = null;
  const pathResolver = new PathResolver(projectRoot, context, aliasResolver, false);
  const globalComponents = await readGlobalComponents(pathResolver, miniappRoot || '');
  const result: LintResult = {
    summary: {
      filesScanned: 0,
      filesWithIssues: 0,
      declaredNotUsedCount: 0,
      usedNotDeclaredCount: 0,
    },
    issues: [],
  };

  // 使用位置参数，如果没有则使用 cmdOptions.path，最后默认为空字符串
  const finalTargetPath = targetPath || cmdOptions?.path || '';
  const miniappRootAbs = miniappRoot ? path.resolve(projectRoot, miniappRoot) : projectRoot;

  if (finalTargetPath) {
    await processTargetPath(
      finalTargetPath,
      pathResolver,
      globalComponents,
      result,
      miniappRootAbs,
      projectRoot,
    );
  } else {
    await processWholeProject(
      projectRoot,
      context,
      pathResolver,
      globalComponents,
      result,
      miniappRootAbs,
    );
  }
  generateReport(result, miniappRootAbs, projectRoot);

  // Apply fixes if --fix is enabled
  if (cmdOptions?.fix) {
    await applyLintFixes(result, projectRoot);
  }
}
