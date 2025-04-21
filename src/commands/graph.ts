import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { CommandOptions } from '../types/command-options';
import { ConfigLoader } from '../utils/config-loader';
import { logger } from '../utils/debug-logger';
import { isString, mergeOptions } from '../utils/options-merger';

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

// Restore renderHTML function (basic implementation)
function renderHTML(graphData: {
  nodes: { id: string }[];
  links: { source: string; target: string }[];
}): string {
  // Simplified HTML template - consider using a proper library like D3 or vis.js for robust rendering
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Dependency Graph</title>
  <meta charset="utf-8">
  <style>
    body { margin: 20px; font-family: sans-serif; }
    .node { fill: #add8e6; stroke: #666; }
    .link { stroke: #999; stroke-opacity: 0.6; }
    text { font-size: 10px; pointer-events: none; }
    svg { border: 1px solid #ccc; }
  </style>
</head>
<body>
  <h1>Dependency Graph (JSON Data)</h1>
  <p>Interactive HTML rendering requires a JS library (e.g., D3.js). Showing raw JSON data instead.</p>
  <pre id="graph-data">${JSON.stringify(graphData, null, 2)}</pre>
</body>
</html>
  `;
}

// Restore renderDOT function (basic implementation)
function renderDOT(graphData: {
  nodes: { id: string }[];
  links: { source: string; target: string }[];
}): string {
  let dot = 'digraph DependencyGraph {\n';
  dot += '  node [shape=box, style=rounded, fontname="sans-serif", fontsize=10];\n';
  dot += '  edge [fontname="sans-serif", fontsize=9];\n';
  dot += '  graph [fontname="sans-serif", fontsize=10];\n\n';

  // Add nodes
  for (const node of graphData.nodes) {
    // Use relative paths for labels if possible, otherwise full ID
    // This assumes node.id is an absolute path
    const label = node.id.includes(path.sep) ? path.basename(node.id) : node.id;
    dot += `  "${node.id}" [label="${label}"];\n`;
  }

  dot += '\n';

  // Add edges
  for (const link of graphData.links) {
    dot += `  "${link.source}" -> "${link.target}";\n`;
  }

  dot += '}\n';
  return dot;
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
  const types = mergedConfig.types ?? 'js,ts,json,wxml,wxss'; // Default types for graph
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
    const fileTypes = types.split(',').map((t) => t.trim());

    // Call analyzeProject with final options
    const { dependencyGraph } = await analyzeProject(projectRoot, {
      // Use projectRoot
      fileTypes,
      excludePatterns: exclude,
      essentialFiles: essentialFilesList,
      verbose,
      verboseLevel,
      miniappRoot,
      entryFile,
      entryContent: mergedConfig.entryContent,
    });

    logger.info('Rendering graph...');
    // Convert graph to simple JSON structure for renderers
    // TODO: Add depth and focus filtering here if needed before rendering
    const graphData = dependencyGraph.toJSON();

    // Call local rendering functions based on format
    let outputContent: string | Buffer = ''; // Use Buffer for potential binary formats
    switch (format) {
      case 'html':
        outputContent = renderHTML(graphData);
        break;
      case 'dot':
        outputContent = renderDOT(graphData);
        break;
      case 'json':
        outputContent = JSON.stringify(graphData, null, 2);
        break;
      case 'svg':
      case 'png':
        // Basic DOT output for these formats, requires external tool (Graphviz) to convert
        outputContent = renderDOT(graphData);
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
      // Remove automatic saving for binary formats when no output is specified
      // if (format === 'png' || format === 'svg') { ... }
    }
  } catch (error) {
    logger.error(`Graph generation failed: ${(error as Error).message}`);
    // Add stack check here too
    const stack = (error as Error).stack;
    if (stack) {
      logger.debug(stack);
    }
    throw error;
  }
}
