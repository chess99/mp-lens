import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { ProjectStructure } from '../analyzer/project-structure';
import { CommandOptions } from '../types/command-options';
import { ConfigLoader } from '../utils/config-loader';
import { logger } from '../utils/debug-logger';
import { isString, mergeOptions } from '../utils/options-merger';
import { DotGenerator } from '../visualizer/dot-generator';
import { HtmlGenerator } from '../visualizer/html-generator';

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
export interface GraphOptions extends CommandOptions {
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
  // 1. Resolve Project Path and Set Logger Root
  const projectRoot = path.resolve(rawOptions.project);
  logger.setProjectRoot(projectRoot);
  logger.info(`Resolved project root: ${projectRoot}`);
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Project directory does not exist: ${projectRoot}`);
  }

  // 2. Load config file
  const fileConfig = await ConfigLoader.loadConfig(rawOptions.config, projectRoot);
  logger.debug('Loaded config file content for graph:', fileConfig);

  // 3. Merge options
  const mergedConfig = mergeOptions(rawOptions, fileConfig, projectRoot);
  logger.debug('Final merged options for graph:', mergedConfig);

  // 4. Extract and type final options for this command
  const verbose = mergedConfig.verbose ?? false;
  const verboseLevel = mergedConfig.verboseLevel;
  const miniappRoot = mergedConfig.miniappRoot;
  const entryFile = mergedConfig.entryFile;
  const format = mergedConfig.format ?? 'html';
  const output = mergedConfig.output; // Resolved path or undefined
  const depth = mergedConfig.depth;
  const focus = mergedConfig.focus; // Resolved path or undefined
  const npm = mergedConfig.npm ?? false;
  // Graph-specific options from merged config
  const exclude = mergedConfig.exclude ?? [];
  const essentialFilesList = (mergedConfig.essentialFiles as string[] | undefined) ?? [];

  // Log final options
  logger.info(`Output format: ${format}`);
  logger.info('Generating project dependency graph...');
  logger.info(`Project path: ${projectRoot}`);
  if (miniappRoot) logger.info(`Using Miniapp root directory: ${miniappRoot}`);
  if (entryFile) logger.info(`Using specific entry file: ${entryFile}`);
  if (output) logger.info(`Output file: ${output}`);
  if (depth !== undefined) logger.info(`Max depth: ${depth}`);
  if (focus) logger.info(`Focusing on file: ${focus}`);
  if (npm) logger.info('Including npm dependencies');

  try {
    logger.info('Analyzing project dependencies...');
    const fileTypes = mergedConfig.types?.split(',').map((t: string) => t.trim()) ?? [];

    // Call analyzeProject with final options
    const { projectStructure } = await analyzeProject(projectRoot, {
      fileTypes,
      excludePatterns: exclude,
      essentialFiles: essentialFilesList,
      verbose,
      verboseLevel,
      miniappRoot,
      entryFile,
      entryContent: mergedConfig.entryContent,
      keepAssets: mergedConfig.keepAssets,
    });

    logger.info('Rendering graph...');

    // Initialize generators with the new ProjectStructure
    const htmlGenerator = new HtmlGenerator(projectStructure);
    const dotGenerator = new DotGenerator(projectStructure);

    // Call appropriate renderer with depth and focus parameters
    let outputContent: string | Buffer = ''; // Use Buffer for potential binary formats
    switch (format) {
      case 'html':
        outputContent = htmlGenerator.generate({
          title: 'Dependency Graph',
          maxDepth: depth,
          focusNode: focus,
        });
        break;
      case 'dot':
        outputContent = dotGenerator.generate({
          title: 'Project Dependency Graph',
          maxDepth: depth,
          focusNode: focus,
        });
        break;
      case 'json':
        logger.warn(
          'JSON output currently does not support depth/focus filtering. Outputting full structure.',
        );
        outputContent = renderJSON(projectStructure);
        break;
      case 'svg':
      case 'png':
        outputContent = dotGenerator.generate({
          title: 'Project Dependency Graph',
          maxDepth: depth,
          focusNode: focus,
        });
        logger.warn(
          chalk.yellow(
            `Format '${format}' requires Graphviz installed to convert DOT output. Saving DOT content.`,
          ),
        );
        if (isString(output) && (output.endsWith('.png') || output.endsWith('.svg'))) {
          logger.warn(`Output file will contain DOT content, not a ${format.toUpperCase()} image.`);
        }
        break;
      default:
        throw new Error(`Unsupported output format: ${format}`);
    }

    // Handle output using the type guard
    if (isString(output)) {
      const outputDir = path.dirname(output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      // Write the generated content (string or buffer)
      fs.writeFileSync(output, outputContent);
      logger.info(`✅ Graph saved to: ${output}`);
    } else {
      // Output to console
      if (
        format === 'json' ||
        format === 'dot' ||
        format === 'html' ||
        format === 'svg' ||
        format === 'png'
      ) {
        // Only log string content to console
        if (typeof outputContent === 'string') {
          console.log(outputContent);
        } else {
          logger.warn(`Cannot output binary data for format '${format}' to console. Use --output.`);
        }
      } else {
        logger.warn(`Console output for format '${format}' might not be meaningful. Use --output.`);
      }
    }
  } catch (error) {
    logger.error(`Graph generation failed: ${(error as Error).message}`);
    const stack = (error as Error).stack;
    if (stack) {
      logger.debug(stack);
    }
    throw error;
  }
}
