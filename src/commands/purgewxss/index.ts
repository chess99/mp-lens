import chalk from 'chalk';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { PurgeCSS } from 'purgecss';
import {
  AnalyzerOptions,
  CmdPurgeWxssOptions,
  GlobalCliOptions,
} from '../../types/command-options';
import { initializeCommandContext } from '../../utils/command-init';
import { logger } from '../../utils/debug-logger';
import { HandledError } from '../../utils/errors';
import { PathResolver } from '../../utils/path-resolver';
import { analyzeWxmlForPurge, WxmlPurgeAnalysisResult } from './analyzeWxmlForPurge';

async function performPurge(
  projectRoot: string,
  scanRoot: string,
  cmdOptions: CmdPurgeWxssOptions,
  pathResolver: PathResolver,
  context: AnalyzerOptions,
): Promise<void> {
  const { wxssFilePathInput, write } = cmdOptions;
  let commandHadErrors = false;
  let writeableChangesCount = 0;
  let totalPotentialSavings = 0;

  let wxssFilesToProcess: string[] = [];

  if (wxssFilePathInput) {
    const absolutePath = path.isAbsolute(wxssFilePathInput)
      ? wxssFilePathInput
      : path.resolve(projectRoot, wxssFilePathInput);
    try {
      const statResult = await fs.stat(absolutePath);
      if (!statResult.isFile()) {
        throw new HandledError(`指定的 WXSS 输入不是一个文件: ${absolutePath}`);
      }
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        throw new HandledError(`WXSS 文件未找到: ${absolutePath}`);
      }
      throw new HandledError(`无法访问 WXSS 文件: ${absolutePath} (${e.message})`);
    }

    if (path.extname(absolutePath) !== '.wxss') {
      throw new HandledError(`输入文件不是 .wxss 文件: ${absolutePath}`);
    }
    wxssFilesToProcess.push(absolutePath);
  } else {
    const pattern = path.join(scanRoot, '**/*.wxss').replace(/\\/g, '/');

    const excludePatterns = context.excludePatterns || [];
    const ignorePatterns = [
      path.join(scanRoot, 'node_modules/**').replace(/\\/g, '/'),
      path.join(scanRoot, 'dist/**').replace(/\\/g, '/'),
      path.join(scanRoot, '**/iconfont.wxss').replace(/\\/g, '/'),
      path.join(scanRoot, '**/custom-theme.wxss').replace(/\\/g, '/'),
      ...excludePatterns.map((p) => path.join(scanRoot, p).replace(/\\/g, '/')),
    ];

    try {
      wxssFilesToProcess = await glob(pattern, {
        ignore: ignorePatterns,
        nodir: true,
        absolute: true,
        cwd: scanRoot,
      });
    } catch (err: any) {
      throw new Error(`扫描 WXSS 文件时出错: ${err.message}`);
    }

    if (wxssFilesToProcess.length === 0) {
      logger.info(chalk.yellow('在指定目录未找到 WXSS 文件 (或所有文件都被忽略)。'));
      return;
    }
  }

  if (wxssFilesToProcess.length > 0 && !wxssFilePathInput) {
    const rootForDisplay = path.relative(projectRoot, scanRoot) || '.';
    logger.info(`将在 ${rootForDisplay} 目录中分析 ${wxssFilesToProcess.length} 个 WXSS 文件...`);
  }

  for (const wxssFilePath of wxssFilesToProcess) {
    const relativeWxssPath = path.relative(projectRoot, wxssFilePath);
    let statusMessage = '';

    const wxmlFilePath = wxssFilePath.replace(/\.wxss$/, '.wxml');
    try {
      await fs.access(wxmlFilePath);
    } catch {
      statusMessage = chalk.yellow('跳过 (WXML 未找到)');
      logger.info(`${relativeWxssPath} ${statusMessage}`);
      continue;
    }

    try {
      const wxmlAnalysisResult: WxmlPurgeAnalysisResult = await analyzeWxmlForPurge(
        wxmlFilePath,
        pathResolver,
        new Set(),
      );

      if (wxmlAnalysisResult.wxmlFilePaths.size === 0) {
        try {
          await fs.access(wxmlFilePath);
        } catch {
          statusMessage = chalk.yellow('跳过 (WXML 未找到)');
          logger.info(`${relativeWxssPath} ${statusMessage}`);
          continue;
        }
        statusMessage = chalk.yellow('跳过 (WXML 分析失败或为空)');
        logger.info(`${relativeWxssPath} ${statusMessage}`);
        continue;
      }

      // Skip WXSS processing if its corresponding WXML has risky dynamic class patterns
      if (
        wxmlAnalysisResult.riskyDynamicClassPatterns &&
        wxmlAnalysisResult.riskyDynamicClassPatterns.length > 0
      ) {
        statusMessage = chalk.yellow('跳过 (WXML 中检测到有风险的动态类名用法)');
        logger.info(`${relativeWxssPath} ${statusMessage}`);
        logger.warn(`  详情: WXML 文件 ${wxmlFilePath} 或其导入包含以下风险用法:`);
        wxmlAnalysisResult.riskyDynamicClassPatterns.forEach((pattern) => {
          // Show relative path to the specific WXML file containing the risky pattern
          const riskyFilePathRelative = path.relative(projectRoot, pattern.filePath);
          logger.warn(`    - 文件: ${riskyFilePathRelative}, 表达式: ${pattern.expression}`);
        });
        continue;
      }

      const wxssContent = await fs.readFile(wxssFilePath, 'utf-8');
      if (!wxssContent.trim()) {
        statusMessage = chalk.gray('跳过 (WXSS 文件为空)');
        logger.info(`${relativeWxssPath} ${statusMessage}`);
        continue;
      }

      const safelistStandard: (string | RegExp)[] = [
        ...wxmlAnalysisResult.tagNames,
        ...wxmlAnalysisResult.staticClassNames,
      ];
      wxmlAnalysisResult.dynamicClassValues.forEach((dynValue) => {
        const innerContent = dynValue.substring(2, dynValue.length - 2);
        const words = innerContent.match(/[a-zA-Z0-9_-]+/g) || [];
        words.forEach((word) => {
          if (word.length > 1 && !safelistStandard.includes(word)) {
            safelistStandard.push(word);
          }
        });
      });
      const commonTagsToExclude = new Set(['block', 'template', 'slot']);
      const finalSafeList = safelistStandard.filter((s) =>
        typeof s === 'string' ? !commonTagsToExclude.has(s) : true,
      );

      const purger = new PurgeCSS();
      const purgeResults = await purger.purge({
        content: await Promise.all(
          Array.from(wxmlAnalysisResult.wxmlFilePaths).map(
            async (fp) =>
              ({
                raw: await fs.readFile(fp, 'utf-8'),
                extension: 'wxml',
              }) as { raw: string; extension: string },
          ),
        ),
        css: [{ raw: wxssContent, name: path.basename(wxssFilePath) }],
        safelist: { standard: finalSafeList },
      });

      const originalSize = Buffer.byteLength(wxssContent, 'utf-8');

      if (purgeResults.length > 0 && purgeResults[0].css) {
        const purgedCss = purgeResults[0].css;
        const newSize = Buffer.byteLength(purgedCss, 'utf-8');
        const diff = originalSize - newSize;

        if (diff > 0) {
          statusMessage = chalk.green(`节省 ${diff}B`);
          if (write) {
            await fs.writeFile(wxssFilePath, purgedCss);
            statusMessage += chalk.blue(' (已写入)');
          } else {
            writeableChangesCount++;
            totalPotentialSavings += diff;
          }
        } else if (diff === 0) {
          statusMessage = chalk.gray('无变化');
        } else {
          statusMessage = chalk.yellow(`增大 ${-diff}B (检查 safelist)`);
        }
      } else if (purgeResults.length > 0 && purgeResults[0].css === '') {
        if (wxssContent.trim().length > 0) {
          statusMessage = chalk.yellow('可清空');
          if (write) {
            await fs.writeFile(wxssFilePath, '');
            statusMessage += chalk.blue(' (已写入)');
          } else {
            writeableChangesCount++;
            totalPotentialSavings += originalSize;
          }
        } else {
          statusMessage = chalk.gray('无变化 (文件已为空)');
        }
      } else {
        statusMessage = chalk.red('PurgeCSS 处理失败');
      }
      logger.info(`${relativeWxssPath} ${statusMessage}`);
    } catch (error: any) {
      logger.error(chalk.red(`  处理文件 ${relativeWxssPath} 时出错: ${error.message}`));
      commandHadErrors = true;
    }
  }

  if (!write && writeableChangesCount > 0) {
    const savingsInKb = (totalPotentialSavings / 1024).toFixed(1);
    logger.info(
      chalk.yellow(
        `检测到 ${writeableChangesCount} 个文件有可优化空间 (合计约 ${savingsInKb}KB)。请使用 --write 参数实际写入更改。`,
      ),
    );
  }

  if (commandHadErrors) {
    logger.error(chalk.red('PurgeWXSS 命令执行完毕，但出现错误。'));
    if (!process.exitCode) process.exitCode = 1;
  } else {
    if (wxssFilesToProcess.length > 0 && !commandHadErrors) {
      // Consider if this final message is needed if all files were skipped or had individual statuses
    }
    logger.info(chalk.green('PurgeWXSS 分析完成。'));
  }
}

export async function purgewxss(
  cliOptions: GlobalCliOptions,
  wxssFilePath?: string,
  cmdOptions?: CmdPurgeWxssOptions,
): Promise<void> {
  const context = await initializeCommandContext(cliOptions);
  const { projectRoot, miniappRoot } = context;
  const scanRoot = miniappRoot || projectRoot;
  const pathResolver = new PathResolver(projectRoot, context);

  const enhancedCmdOptions = {
    ...cmdOptions,
    wxssFilePathInput: wxssFilePath || cmdOptions?.wxssFilePathInput,
  };

  await performPurge(projectRoot, scanRoot, enhancedCmdOptions, pathResolver, context);
}
