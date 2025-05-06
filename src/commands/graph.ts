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
    logger.info(`Resolved output path: ${outputPathAbsolute}`);
  }

  // === Log Graph-Specific Options ===
  logger.info(`Output format: ${format}`);
  // Note: Common path logging is done in initializeCommandContext
  if (outputPathAbsolute) logger.info(`Output file: ${outputPathAbsolute}`);
  if (depth !== undefined) logger.info(`Max depth: ${depth}`);
  if (focus) logger.info(`Focusing on file: ${focus}`);
  if (npm) logger.info('Including npm dependencies');

  try {
    logger.info('Analyzing project dependencies...');
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

    logger.info('Rendering graph...');

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

    // Handle output (Now consistent for all text-based formats)
    if (outputPathAbsolute) {
      const outputDir = path.dirname(outputPathAbsolute);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      // Ensure outputContent is string or buffer before writing
      if (typeof outputContent === 'string' || Buffer.isBuffer(outputContent)) {
        fs.writeFileSync(outputPathAbsolute, outputContent);
        logger.info(`✅ Graph saved to: ${outputPathAbsolute}`);
      } else {
        // This case should ideally not happen with current formats
        logger.error(`Internal error: outputContent is not writable for format ${format}`);
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
            logger.info(`✅ Graph saved to: ${defaultHtmlPath}`);
          } else {
            logger.error('Internal error: HTML outputContent is not a string.');
          }
        } catch (writeError) {
          logger.error(
            `Failed to save default HTML graph to ${defaultHtmlPath}: ${(writeError as Error).message}`,
          );
        }
      } else if (typeof outputContent === 'string') {
        // Default behavior for other text formats: print to console
        console.log(outputContent);
      } else {
        // Handle binary formats like potential future image generation
        logger.warn(`Cannot output binary data for format '${format}' to console. Use --output.`);
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
