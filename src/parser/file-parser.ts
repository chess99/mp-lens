import * as fs from 'fs';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { logger } from '../utils/debug-logger';
import {
  COMPONENT_DEFINITION_FILE_TYPES,
  IMAGE_FILE_TYPES,
  SupportedFileType,
} from '../utils/filetypes';
import { PathResolver } from '../utils/path-resolver';
import {
  DependencyKind,
  linkTypeForDependencyKind,
  ParsedDependency,
  ResolvedDependency,
} from './dependency-types';

// Import specialized parsers with corrected paths relative to src/analyzer/
import { JavaScriptParser } from './javascript-parser';
import { JSONParser } from './json-parser';
import { WXMLParser } from './wxml-parser';
import { WXSSParser } from './wxss-parser';

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
    if (options.miniappRoot) {
      logger.debug(`FileParser using custom miniapp root: ${options.miniappRoot}`);
    }

    // Instantiate PathResolver with pre-merged aliases
    this.pathResolver = new PathResolver(projectRoot, options);

    // Instantiate specialized parsers - they now only handle text analysis
    this.javaScriptParser = new JavaScriptParser();
    this.wxmlParser = new WXMLParser();
    this.wxssParser = new WXSSParser();
    this.jsonParser = new JSONParser();
  }

  /**
   * Parses a single file by reading its content and delegating text analysis to the appropriate parser.
   * Handles path resolution centrally.
   * Returns a list of resolved dependencies with their source-specific dependency kind.
   */
  async parseFile(filePath: string): Promise<ResolvedDependency[]> {
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
        case '.less':
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

      const parsedDependencies = rawDependencies.map((rawPath) =>
        this.toParsedDependency(rawPath, filePath, ext),
      );

      // Resolve all raw dependency paths to absolute paths
      const resolvedDependencies: ResolvedDependency[] = [];
      for (const dependency of parsedDependencies) {
        const resolvedPath = this.resolveDependencyPath(dependency);
        if (resolvedPath) {
          resolvedDependencies.push({
            ...dependency,
            targetFile: resolvedPath,
            linkType: linkTypeForDependencyKind(dependency.kind),
          });
        }
      }

      return resolvedDependencies;
    } catch (e: unknown) {
      const err = e as Error;
      // Centralized error handling for file reading or parsing issues
      logger.warn(`Error parsing file ${filePath}: ${err.message}`);
      return []; // Return empty array on error
    }
  }

  /**
   * Resolves a raw dependency path to an absolute path based on file type context
   */
  private toParsedDependency(
    rawPath: string,
    sourceFile: string,
    sourceExt: string,
  ): ParsedDependency {
    return {
      sourceFile,
      rawPath,
      kind: this.inferDependencyKind(rawPath, sourceExt),
    };
  }

  private inferDependencyKind(rawPath: string, sourceExt: string): DependencyKind {
    switch (sourceExt) {
      case '.js':
      case '.ts':
      case '.wxs':
        return path.extname(rawPath).toLowerCase() === '.json' ? 'config' : 'script';
      case '.wxml':
        if (this.isImagePath(rawPath)) {
          return 'resource';
        }
        if (rawPath.includes('.wxs') || rawPath.endsWith('.wxs')) {
          return 'script';
        }
        return 'template';
      case '.wxss':
      case '.less':
        return this.isImagePath(rawPath) ? 'resource' : 'style';
      case '.json':
        return this.isImagePath(rawPath) ? 'resource' : 'component';
      default:
        return 'script';
    }
  }

  private resolveDependencyPath(dependency: ParsedDependency): string | null {
    // Determine allowed extensions based on source file type and dependency context
    let allowedExtensions: readonly SupportedFileType[];

    switch (dependency.kind) {
      case 'script':
        if (path.extname(dependency.sourceFile).toLowerCase() === '.wxs') {
          allowedExtensions = ['wxs'];
        } else {
          allowedExtensions = ['js', 'ts', 'd.ts', 'json', 'wxs'];
        }
        break;
      case 'config':
        allowedExtensions = ['json'];
        break;
      case 'component':
        allowedExtensions = COMPONENT_DEFINITION_FILE_TYPES;
        break;
      case 'template':
        allowedExtensions = ['wxml'];
        break;
      case 'style':
        allowedExtensions = ['wxss', 'less'];
        break;
      case 'resource':
        allowedExtensions = IMAGE_FILE_TYPES;
        break;
      case 'worker':
        allowedExtensions = ['js', 'ts'];
        break;
      default:
        allowedExtensions = ['js', 'ts', 'd.ts', 'json'];
    }

    return this.pathResolver.resolveAnyPath(
      this.pathForResolution(dependency),
      dependency.sourceFile,
      allowedExtensions,
    );
  }

  private pathForResolution(dependency: ParsedDependency): string {
    const sourceExt = path.extname(dependency.sourceFile).toLowerCase();
    const shouldResolveRelativeToSource =
      (sourceExt === '.wxss' || sourceExt === '.less') &&
      (dependency.kind === 'style' || dependency.kind === 'resource') &&
      !dependency.rawPath.startsWith('.') &&
      !dependency.rawPath.startsWith('/') &&
      !/^(data:|https?:\/\/|\/\/)/.test(dependency.rawPath);

    return shouldResolveRelativeToSource ? `./${dependency.rawPath}` : dependency.rawPath;
  }

  /**
   * Determines if a path refers to an image file based on its extension
   */
  private isImagePath(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (!ext) {
      return false;
    }
    // Strictly check if the file extension is an image extension
    return (IMAGE_FILE_TYPES as readonly string[]).includes(ext.slice(1));
  }
}
