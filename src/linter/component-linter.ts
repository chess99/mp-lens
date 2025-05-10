import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/debug-logger';
import { filterStandardWxmlTags } from './standard-wxml-tags';
import { LintIssue } from './types';

/**
 * Performs component usage linting by comparing declarations with usage
 *
 * @param wxmlFilePath Path to the WXML file
 * @param jsonFilePath Path to the corresponding JSON file
 * @param usedTagToFiles Map<tag, Set<wxmlFile>>
 * @param globalComponents Object containing globally declared components from app.json
 * @returns Lint issue object containing any identified problems
 */
export function lintComponentUsage(
  wxmlFilePath: string,
  jsonFilePath: string,
  usedTagToFiles: Map<string, Set<string>>,
  globalComponents: Record<string, string>,
): LintIssue {
  // Initialize result object
  const result: LintIssue = {
    id: '', // will be set by processFilePair
    wxmlFile: wxmlFilePath,
    jsonFile: jsonFilePath,
    declaredNotUsed: [],
    usedNotDeclared: [],
  };

  try {
    // Read and parse JSON file
    const jsonContent = fs.readFileSync(jsonFilePath, 'utf-8');
    const jsonData = JSON.parse(jsonContent);

    // Extract using components
    const localUsingComponents = jsonData.usingComponents || {};

    // Extract component generics if they exist
    const componentGenerics = jsonData.componentGenerics || {};

    // Merge local components with global components to form all declared components
    const declaredComponents: Record<string, string> = {
      ...globalComponents,
      ...localUsingComponents,
      ...componentGenerics,
    };

    // Filter out standard WXML tags from used tags
    const usedCustomTags = Array.from(usedTagToFiles.keys()).filter(
      (tag) => filterStandardWxmlTags(new Set([tag])).size > 0,
    );

    // Find components declared but not used
    for (const [componentTag, componentPath] of Object.entries(declaredComponents)) {
      if (!usedCustomTags.includes(componentTag)) {
        result.declaredNotUsed.push({
          componentTag,
          path: componentPath,
        });
      }
    }

    // Find tags used but not declared
    for (const tag of usedCustomTags) {
      if (!declaredComponents[tag]) {
        const usedIn = Array.from(usedTagToFiles.get(tag) || []);
        result.usedNotDeclared.push({
          componentTag: tag,
          usedIn,
          suggestion: `Consider adding '${tag}' to the usingComponents section in ${path.basename(jsonFilePath)}`,
        });
      }
    }
  } catch (err) {
    logger.error(`Error linting component usage for ${wxmlFilePath}: ${err}`);
  }

  return result;
}
