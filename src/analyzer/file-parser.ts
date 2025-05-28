import * as fs from 'fs';
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
 * Handles file reading and path resolution, then delegates text analysis to specialized parsers.
 */
export class FileParser {
  private pathResolver: PathResolver;

  // Store instances of specialized parsers
  private javaScriptParser: JavaScriptParser;
  private wxmlParser: WXMLParser;
  private wxssParser: WXSSParser;
  private jsonParser: JSONParser;

  constructor(projectRoot: string, options: AnalyzerOptions) {
    const actualRoot = options.miniappRoot || projectRoot;

    if (options.miniappRoot) {
      logger.debug(`FileParser using custom miniapp root: ${options.miniappRoot}`);
    }

    const aliasResolver = new AliasResolver(actualRoot);
    const hasAliasConfig = aliasResolver.initialize();

    if (hasAliasConfig) {
      logger.debug('Alias configuration detected, automatically enabling alias resolution');
      logger.debug('Alias configuration:', aliasResolver.getAliases());
    }

    // Instantiate PathResolver
    this.pathResolver = new PathResolver(projectRoot, options, aliasResolver, hasAliasConfig);

    // Instantiate specialized parsers - they now only handle text analysis
    this.javaScriptParser = new JavaScriptParser();
    this.wxmlParser = new WXMLParser();
    this.wxssParser = new WXSSParser();
    this.jsonParser = new JSONParser();
  }

  /**
   * Parses a single file by reading its content and delegating text analysis to the appropriate parser.
   * Handles path resolution centrally.
   * Returns a list of absolute paths to the file's dependencies.
   */
  async parseFile(filePath: string): Promise<string[]> {
    const ext = path.extname(filePath).toLowerCase();

    try {
      // Read file content once at the top level
      const content = fs.readFileSync(filePath, 'utf-8');
      let rawDependencies: string[] = [];

      // Delegate text analysis to specialized parsers
      switch (ext) {
        case '.js':
        case '.ts':
        case '.wxs': // WXS files are JavaScript, use the same parser
          rawDependencies = await this.javaScriptParser.parse(content, filePath);
          break;
        case '.wxml':
          rawDependencies = await this.wxmlParser.parse(content, filePath);
          break;
        case '.wxss':
          rawDependencies = await this.wxssParser.parse(content, filePath);
          break;
        case '.json':
          rawDependencies = await this.jsonParser.parse(content, filePath);
          break;
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

      // Resolve all raw dependency paths to absolute paths
      const resolvedDependencies: string[] = [];
      for (const rawPath of rawDependencies) {
        const resolvedPath = this.resolveDependencyPath(rawPath, filePath, ext);
        if (resolvedPath) {
          resolvedDependencies.push(resolvedPath);
        }
      }

      return resolvedDependencies;
    } catch (e: any) {
      // Centralized error handling for file reading or parsing issues
      logger.warn(`Error parsing file ${filePath}: ${e.message}`);
      return []; // Return empty array on error
    }
  }

  /**
   * Resolves a raw dependency path to an absolute path based on file type context
   */
  private resolveDependencyPath(
    rawPath: string,
    sourcePath: string,
    sourceExt: string,
  ): string | null {
    // Determine allowed extensions based on source file type and dependency context
    let allowedExtensions: string[];

    switch (sourceExt) {
      case '.js':
      case '.ts':
        allowedExtensions = ['.js', '.ts', '.json'];
        break;
      case '.wxs':
        allowedExtensions = ['.wxs']; // WXS files can only import other WXS files
        break;
      case '.wxml':
        // WXML can reference .wxml (import/include), .wxs, and image files
        // Determine type based on path characteristics
        if (this.isImagePath(rawPath)) {
          allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
        } else if (rawPath.includes('.wxs') || rawPath.endsWith('.wxs')) {
          allowedExtensions = ['.wxs'];
        } else {
          // Default to WXML for import/include
          allowedExtensions = ['.wxml'];
        }
        break;
      case '.wxss':
        // WXSS can import other WXSS files or reference image files
        if (this.isImagePath(rawPath)) {
          allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
        } else {
          allowedExtensions = ['.wxss'];
        }
        break;
      case '.json':
        // JSON files can reference various file types depending on context
        // For pages and components, we need to find all related files
        if (this.isImagePath(rawPath)) {
          allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
        } else {
          // For pages/components, try to find the main file first
          allowedExtensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];
        }
        break;
      default:
        allowedExtensions = [];
    }

    return this.pathResolver.resolveAnyPath(rawPath, sourcePath, allowedExtensions);
  }

  /**
   * Determines if a path refers to an image file based on its extension
   */
  private isImagePath(filePath: string): boolean {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    const ext = path.extname(filePath).toLowerCase();

    // Strictly check if the file extension is an image extension
    return imageExtensions.includes(ext);
  }
}
