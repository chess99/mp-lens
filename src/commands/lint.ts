import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { getNodeIdAndLabel } from '../analyzer/utils/node-utils';
import { PathResolver } from '../analyzer/utils/path-resolver';
import { lintComponentUsage } from '../linter/component-linter';
import { LintResult } from '../linter/types';
import { analyzeWxmlTags } from '../linter/wxml-analyzer';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';

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
      miniappRoot
        ? path.join(pathResolver['projectRoot'], miniappRoot)
        : pathResolver['projectRoot'],
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
    // Read and parse JSON file to determine type
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    const jsonData = JSON.parse(jsonContent);
    const isComponent = jsonData.component === true;
    const type = isComponent ? 'Component' : 'Page';
    const basePath = wxmlPath.replace(/\.wxml$/, '');
    const { id } = getNodeIdAndLabel(type, basePath, miniappRoot);
    // Lint component usage
    const lintIssue = lintComponentUsage(wxmlPath, jsonPath, usedTagToFiles, globalComponents);
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
    logger.info(`Processing directory: ${dirPath}`);
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
    logger.error(`Unsupported file type: ${filePath}`);
    return;
  }
  if (!fs.existsSync(wxmlPath)) {
    logger.error(`WXML file not found: ${wxmlPath}`);
    return;
  }
  if (!fs.existsSync(jsonPath)) {
    logger.error(`JSON file not found: ${jsonPath}`);
    return;
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
  const resolvedTargetPath = pathResolver.resolveAnyPath(targetPath, projectRoot, [
    '',
    '.wxml',
    '.json',
  ]);
  if (!resolvedTargetPath || !fs.existsSync(resolvedTargetPath)) {
    logger.error(`Target path not found: ${targetPath}`);
    return;
  }
  const stats = fs.statSync(resolvedTargetPath);
  if (stats.isDirectory()) {
    await processDirectory(
      resolvedTargetPath,
      pathResolver,
      globalComponents,
      result,
      miniappRoot,
      projectRoot,
    );
  } else {
    await processFile(
      resolvedTargetPath,
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
    logger.info('Processing whole project...');
    const projectAnalysis = await analyzeProject(projectRoot, options);
    const nodes = projectAnalysis.projectStructure.nodes.filter(
      (node) => node.type === 'Page' || node.type === 'Component',
    );
    logger.info(`Found ${nodes.length} pages/components to analyze`);
    for (const node of nodes) {
      const basePath = node.properties?.basePath;
      if (!basePath) continue;
      const wxmlFilePath = basePath + '.wxml';
      const jsonFilePath = basePath + '.json';
      if (fs.existsSync(wxmlFilePath) && fs.existsSync(jsonFilePath)) {
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
  console.log('\nComponent Usage Analysis Results:');
  console.log('================================\n');

  if (result.issues.length === 0) {
    console.log(chalk.green('✓ No issues found. All component declarations match usage.'));
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
        console.log('  Declared but not used in WXML:');
        for (const component of issue.declaredNotUsed) {
          console.log(chalk.yellow(`    - ${component.componentTag}`));
        }
        console.log('');
      }
      // Used but not declared (grouped by WXML file)
      if (issue.usedNotDeclared.length > 0) {
        const wxmlPath = projectRoot ? path.relative(projectRoot, issue.wxmlFile) : issue.wxmlFile;
        console.log(wxmlPath);
        console.log('  Used in WXML but not declared in JSON:');
        for (const component of issue.usedNotDeclared) {
          console.log(chalk.red(`    - ${component.componentTag}`));
        }
        console.log('');
      }
    }
    // Summary
    console.log(chalk.blue('Summary:'));
    console.log(chalk.blue(`  - Files Scanned: ${result.summary.filesScanned}`));
    console.log(chalk.blue(`  - Files with issues: ${result.summary.filesWithIssues}`));
    console.log(
      chalk.blue(
        `  - Total 'Declared but not used': ${result.summary.declaredNotUsedCount} instances`,
      ),
    );
    console.log(
      chalk.blue(
        `  - Total 'Used but not declared': ${result.summary.usedNotDeclaredCount} instances`,
      ),
    );
    // Tips
    console.log(chalk.cyan('\nTips for resolution:'));
    console.log(
      chalk.cyan(
        '  - For "Declared but not used": Remove the component entry from the \'usingComponents\' section in the .json file.',
      ),
    );
    console.log(chalk.cyan('  - For "Used but not declared":'));
    console.log(chalk.cyan('    1. Ensure the tag in .wxml is not a typo.'));
    console.log(
      chalk.cyan(
        "    2. If it's a valid custom component, add it to 'usingComponents' in the .json file with the correct path.",
      ),
    );
    console.log(
      chalk.cyan(
        '    3. Ensure you have a comprehensive list of native WXML tags if you are manually checking.',
      ),
    );
  }
}

/**
 * Main lint command implementation (now uses initializeCommandContext)
 */
export async function lint(rawOptions: any): Promise<void> {
  const { projectRoot, mergedConfig, miniappRoot } = await initializeCommandContext(
    rawOptions,
    'lint',
  );
  logger.info('Starting component linting process...');
  logger.info(`Project: ${projectRoot}`);
  if (miniappRoot) {
    logger.info(`Miniapp Root: ${miniappRoot}`);
  }
  const aliasResolver = null;
  const pathResolver = new PathResolver(projectRoot, mergedConfig, aliasResolver, false);
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
  const targetPath = rawOptions.path || rawOptions[0] || '';
  const miniappRootAbs = miniappRoot ? path.resolve(projectRoot, miniappRoot) : projectRoot;
  if (targetPath) {
    await processTargetPath(
      targetPath,
      pathResolver,
      globalComponents,
      result,
      miniappRootAbs,
      projectRoot,
    );
  } else {
    await processWholeProject(
      projectRoot,
      mergedConfig,
      pathResolver,
      globalComponents,
      result,
      miniappRootAbs,
    );
  }
  generateReport(result, miniappRootAbs, projectRoot);
}
