import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { AliasResolver } from '../utils/alias-resolver';
import { logger } from '../utils/debug-logger';
import { PathResolver } from './utils/path-resolver';

// Import specialized parsers with corrected paths relative to src/analyzer/
import { JavaScriptParser } from './parsers/javascript-parser';
import { JSONParser } from './parsers/json-parser';
import { WXMLParser } from './parsers/wxml-parser';
import { WXSSParser } from './parsers/wxss-parser';

/**
 * FileParser: Orchestrates parsing of different file types in a WeChat Mini Program.
 * Delegates the actual parsing logic to specialized parser classes.
 */
export class FileParser {
  private projectRoot: string;
  private aliasResolver: AliasResolver | null = null;
  private hasAliasConfig = false;
  private options: AnalyzerOptions;
  private pathResolver: PathResolver;

  // Store instances of specialized parsers
  private javaScriptParser: JavaScriptParser;
  private wxmlParser: WXMLParser;
  private wxssParser: WXSSParser;
  private jsonParser: JSONParser;

  constructor(projectRoot: string, options: AnalyzerOptions) {
    this.projectRoot = projectRoot;
    this.options = options;

    const actualRoot = options.miniappRoot || projectRoot;

    if (options.miniappRoot) {
      logger.debug(`FileParser using custom miniapp root: ${options.miniappRoot}`);
    }

    this.aliasResolver = new AliasResolver(actualRoot);
    this.hasAliasConfig = this.aliasResolver.initialize();

    if (this.hasAliasConfig) {
      logger.debug('Alias configuration detected, automatically enabling alias resolution');
      logger.debug('Alias configuration:', this.aliasResolver.getAliases());
    }

    // Instantiate PathResolver, passing necessary dependencies
    this.pathResolver = new PathResolver(
      this.projectRoot,
      this.options,
      this.aliasResolver,
      this.hasAliasConfig,
    );

    // Instantiate specialized parsers, passing the PathResolver and other needed dependencies
    this.javaScriptParser = new JavaScriptParser(this.pathResolver);
    this.wxmlParser = new WXMLParser(this.pathResolver, this.projectRoot, this.options);
    this.wxssParser = new WXSSParser(this.pathResolver);
    this.jsonParser = new JSONParser(this.pathResolver, this.projectRoot, this.options);
  }

  /**
   * Parses a single file by delegating to the appropriate specialized parser based on extension.
   * Returns a list of absolute paths to the file's dependencies.
   */
  async parseFile(filePath: string): Promise<string[]> {
    const ext = path.extname(filePath).toLowerCase();

    try {
      switch (ext) {
        case '.js':
        case '.ts':
        case '.wxs': // WXS files are JavaScript, use the same parser
          return await this.javaScriptParser.parse(filePath);
        case '.wxml':
          return await this.wxmlParser.parse(filePath);
        case '.wxss':
          return await this.wxssParser.parse(filePath);
        case '.json':
          return await this.jsonParser.parse(filePath);
        case '.png':
        case '.jpg':
        case '.jpeg':
        case '.gif':
        case '.svg':
          return []; // Image files have no dependencies
        default:
          logger.trace(`Unsupported file type for parsing: ${filePath}`);
          return [];
      }
    } catch (e: any) {
      // Centralized error handling for file reading or parsing issues within specialized parsers
      logger.warn(`Error parsing file ${filePath}: ${e.message}`);
      // Optionally log the stack trace for debugging
      // logger.debug(`Stack trace for ${filePath}:`, e.stack);
      return []; // Return empty array on error
    }
  }
}
