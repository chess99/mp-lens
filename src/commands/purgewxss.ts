import chalk from 'chalk';
import { Command } from 'commander';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { PurgeCSS } from 'purgecss';
import { PathResolver } from '../analyzer/utils/path-resolver';
import { analyzeWxmlForPurge, WxmlPurgeAnalysisResult } from '../linter/wxml-analyzer';
import { AnalyzerOptions, CommandOptions } from '../types/command-options';
import { AliasResolver } from '../utils/alias-resolver';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';

interface RawPurgeWxssOptions extends CommandOptions {
  wxssFilePathInput?: string;
  write?: boolean;
}

async function performPurge(
  options: {
    projectRoot: string;
    scanRoot: string;
    miniappRoot?: string;
    wxssFilePathInput?: string;
    write?: boolean;
  },
  pathResolver: PathResolver,
  mergedConfig: CommandOptions,
): Promise<void> {
  const { projectRoot, scanRoot, wxssFilePathInput, write } = options;
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
        logger.error(chalk.red(`指定的 WXSS 输入不是一个文件: ${absolutePath}`));
        process.exitCode = 1;
        return;
      }
    } catch (e) {
      logger.error(chalk.red(`WXSS 文件未找到: ${absolutePath}`));
      process.exitCode = 1;
      return;
    }

    if (path.extname(absolutePath) !== '.wxss') {
      logger.error(chalk.red(`输入文件不是 .wxss 文件: ${absolutePath}`));
      process.exitCode = 1;
      return;
    }
    wxssFilesToProcess.push(absolutePath);
  } else {
    const pattern = path.join(scanRoot, '**/*.wxss').replace(/\\/g, '/');

    const excludePatterns = (mergedConfig as AnalyzerOptions).excludePatterns || [];
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
      logger.error(chalk.red(`扫描 WXSS 文件时出错: ${err.message}`));
      process.exitCode = 1;
      return;
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

export async function purgewxss(rawOptions: RawPurgeWxssOptions): Promise<void> {
  const { projectRoot, mergedConfig, miniappRoot } = await initializeCommandContext(
    rawOptions,
    'purgewxss',
  );

  const scanRoot = miniappRoot || projectRoot;

  const aliasResolver = new AliasResolver(scanRoot);
  const hasAliasConfig = aliasResolver.initialize();

  const pathResolver = new PathResolver(
    projectRoot,
    mergedConfig as AnalyzerOptions,
    aliasResolver,
    hasAliasConfig,
  );

  const purgeOptions = {
    projectRoot,
    scanRoot,
    miniappRoot,
    wxssFilePathInput: rawOptions.wxssFilePathInput,
    write: rawOptions.write,
  };

  await performPurge(purgeOptions, pathResolver, mergedConfig);
}

export function registerPurgeWxssCommand(program: Command): void {
  program
    .command('purgewxss [wxss-file-path]')
    .description(
      '分析 WXML/WXSS 并使用 PurgeCSS 移除未使用的 CSS。未指定路径则处理项目中所有 .wxss 文件。',
    )
    .option('--write', '实际写入对 WXSS 文件的更改。')
    .action(
      async (wxssFilePathInput: string | undefined, cmdSpecificOptions: { write?: boolean }) => {
        const globalOptions = program.opts() as CommandOptions;
        const rawOptions: RawPurgeWxssOptions = {
          ...globalOptions,
          wxssFilePathInput: wxssFilePathInput,
          write: cmdSpecificOptions.write,
        };

        process.exitCode = 0;
        try {
          await purgewxss(rawOptions);
        } catch (error: any) {
          logger.error(chalk.red(`PurgeWXSS 命令执行失败: ${error.message}`));
          if (error.stack) {
            logger.debug(error.stack);
          }
          process.exitCode = 1;
        }
      },
    );
}
