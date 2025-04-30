import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/debug-logger';

/**
 * Interface to track page information including path and containing root directory
 */
interface PageInfo {
  pagePath: string;
  rootDir: string; // Absolute path to the root directory containing the page (miniappRoot or subPkgRoot)
}

/**
 * Finds potential entry points for a Mini Program project.
 * Includes app, pages, subPackages, and components found via usingComponents.
 *
 * @param projectRoot The absolute path to the root of the entire project.
 * @param miniappRoot The absolute path to the root of the miniapp source code (where app.json resides).
 * @returns A promise resolving to an array of entry file paths relative to the projectRoot.
 */
export async function findMiniProgramEntryPoints(
  projectRoot: string,
  miniappRoot: string,
): Promise<string[]> {
  logger.debug(
    '[EntryFinder] Starting Mini Program entry point analysis (incl. components recursively)...',
  );
  logger.debug(`[EntryFinder] Project Root: ${projectRoot}`);
  logger.debug(`[EntryFinder] MiniApp Root: ${miniappRoot}`);

  const entryPoints = new Set<string>();
  const processedComponentJsonPaths = new Set<string>(); // Initialize cycle tracker

  // 1. Find and add global app files
  addImplicitGlobalFiles(projectRoot, miniappRoot, entryPoints);

  // 2. Process app.json globals (Pass tracker)
  const appJsonContent = processAppJsonGlobals(
    projectRoot,
    miniappRoot,
    entryPoints,
    processedComponentJsonPaths,
  );

  // 3. Process Pages and SubPackages (requires appJsonContent)
  let pagesFound: PageInfo[] = [];
  if (appJsonContent) {
    pagesFound = processPagesAndSubPackages(projectRoot, miniappRoot, appJsonContent, entryPoints);
  } else {
    logger.warn(
      '[EntryFinder] Skipping page/subpackage processing due to missing app.json content.',
    );
  }

  // 4. Process page-specific components (Pass tracker)
  if (pagesFound.length > 0) {
    processPageSpecificComponents(
      projectRoot,
      miniappRoot,
      pagesFound,
      entryPoints,
      processedComponentJsonPaths,
    );
  } else {
    logger.debug('[EntryFinder] No pages found, skipping page-specific component processing.');
  }

  logger.info(
    `[EntryFinder] Total potential entry points found (recursive components): ${entryPoints.size}`,
  );
  return Array.from(entryPoints);
}

/**
 * Add standard Mini Program global files as entry points
 */
function addImplicitGlobalFiles(
  projectRoot: string,
  miniappRoot: string,
  entryPoints: Set<string>,
): void {
  const implicitFiles = [
    // App instance files
    'app.js',
    'app.ts',
    // Global styles
    'app.wxss',
    // Configuration files
    'project.config.json',
    'sitemap.json',
  ];

  for (const fileName of implicitFiles) {
    const filePath = path.resolve(miniappRoot, fileName);
    if (fs.existsSync(filePath)) {
      const relativePath = path.relative(projectRoot, filePath);
      entryPoints.add(relativePath);
      logger.debug(`[EntryFinder] Found global file: ${relativePath}`);
    }
  }

  // Special warning only for app.js/ts since it's essential
  const hasAppJs = fs.existsSync(path.resolve(miniappRoot, 'app.js'));
  const hasAppTs = fs.existsSync(path.resolve(miniappRoot, 'app.ts'));
  if (!hasAppJs && !hasAppTs) {
    logger.warn('[EntryFinder] Could not find app.js or app.ts in miniapp root.');
  }
}

/**
 * Process app.json and extract global components
 */
function processAppJsonGlobals(
  projectRoot: string,
  miniappRoot: string,
  entryPoints: Set<string>,
  processedComponentJsonPaths: Set<string>,
): any | null {
  let appJsonContent: any = null;
  try {
    // Directly resolve app.json instead of using resolveAppJson
    const appJsonPath = path.resolve(miniappRoot, 'app.json');

    if (fs.existsSync(appJsonPath)) {
      // Read and parse the file directly
      appJsonContent = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

      // Add app.json to entry points
      entryPoints.add(path.relative(projectRoot, appJsonPath));
      logger.debug(`[EntryFinder] Added app.json: ${path.relative(projectRoot, appJsonPath)}`);

      // Process global components from app.json
      if (appJsonContent?.usingComponents && typeof appJsonContent.usingComponents === 'object') {
        logger.debug('[EntryFinder] Processing global usingComponents...');
        for (const [alias, compPath] of Object.entries(appJsonContent.usingComponents)) {
          if (typeof compPath === 'string') {
            // Use recursive helper and pass tracker
            findComponentEntriesRecursively(
              projectRoot,
              alias,
              compPath,
              miniappRoot,
              miniappRoot,
              entryPoints,
              processedComponentJsonPaths,
            );
          }
        }
      }

      return appJsonContent;
    } else {
      logger.warn('[EntryFinder] Could not find app.json in miniapp root.');
      return null;
    }
  } catch (error) {
    logger.error(`[EntryFinder] Error processing app.json: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Process pages and subpackages from app.json
 */
function processPagesAndSubPackages(
  projectRoot: string,
  miniappRoot: string,
  appJsonContent: any,
  entryPoints: Set<string>,
): PageInfo[] {
  const pagesFound: PageInfo[] = [];

  const findPageEntriesAndStore = (pagePath: string, rootDir: string) => {
    if (typeof pagePath === 'string') {
      pagesFound.push({ pagePath, rootDir }); // Store page path and its root directory

      const pageJsEntry = path.resolve(rootDir, `${pagePath}.js`);
      const pageTsEntry = path.resolve(rootDir, `${pagePath}.ts`);
      if (fs.existsSync(pageJsEntry)) {
        entryPoints.add(path.relative(projectRoot, pageJsEntry));
        logger.debug(`[EntryFinder] Found page entry: ${path.relative(projectRoot, pageJsEntry)}`);
      } else if (fs.existsSync(pageTsEntry)) {
        entryPoints.add(path.relative(projectRoot, pageTsEntry));
        logger.debug(`[EntryFinder] Found page entry: ${path.relative(projectRoot, pageTsEntry)}`);
      }

      // Add WXML file check
      const pageWxml = path.resolve(rootDir, `${pagePath}.wxml`);
      if (fs.existsSync(pageWxml)) {
        entryPoints.add(path.relative(projectRoot, pageWxml));
        logger.debug(`[EntryFinder] Found page template: ${path.relative(projectRoot, pageWxml)}`);
      }

      // Add WXSS file check
      const pageWxss = path.resolve(rootDir, `${pagePath}.wxss`);
      if (fs.existsSync(pageWxss)) {
        entryPoints.add(path.relative(projectRoot, pageWxss));
        logger.debug(`[EntryFinder] Found page style: ${path.relative(projectRoot, pageWxss)}`);
      }

      const pageJson = path.resolve(rootDir, `${pagePath}.json`);
      if (fs.existsSync(pageJson)) {
        entryPoints.add(path.relative(projectRoot, pageJson));
        logger.debug(`[EntryFinder] Found page config: ${path.relative(projectRoot, pageJson)}`);
      }
    }
  };

  // Process main pages
  if (appJsonContent?.pages && Array.isArray(appJsonContent.pages)) {
    logger.debug(`[EntryFinder] Found ${appJsonContent.pages.length} main pages.`);
    appJsonContent.pages.forEach((pagePath: string) =>
      findPageEntriesAndStore(pagePath, miniappRoot),
    );
  } else {
    logger.warn('[EntryFinder] No "pages" array found in app.json content.');
  }

  // Process subPackages
  const subPackages = appJsonContent?.subPackages || appJsonContent?.subpackages || [];
  if (Array.isArray(subPackages) && subPackages.length > 0) {
    logger.debug(`[EntryFinder] Found ${subPackages.length} subPackages.`);
    subPackages.forEach((pkg) => {
      if (pkg && typeof pkg.root === 'string' && Array.isArray(pkg.pages)) {
        const subPkgRoot = path.resolve(miniappRoot, pkg.root);
        logger.debug(`[EntryFinder] Processing subPackage root: ${pkg.root}`);
        pkg.pages.forEach((pagePath: string) => findPageEntriesAndStore(pagePath, subPkgRoot));
      }
    });
  }
  return pagesFound;
}

/**
 * Process components used in page JSON files
 */
function processPageSpecificComponents(
  projectRoot: string,
  miniappRoot: string,
  pagesFound: PageInfo[],
  entryPoints: Set<string>,
  processedComponentJsonPaths: Set<string>,
): void {
  logger.debug(`[EntryFinder] Processing components for ${pagesFound.length} found pages...`);
  for (const { pagePath, rootDir } of pagesFound) {
    const pageJsonPath = path.resolve(rootDir, `${pagePath}.json`);
    if (fs.existsSync(pageJsonPath)) {
      try {
        const pageJsonContent = JSON.parse(fs.readFileSync(pageJsonPath, 'utf-8'));
        if (
          pageJsonContent?.usingComponents &&
          typeof pageJsonContent.usingComponents === 'object'
        ) {
          const pageDir = path.dirname(pageJsonPath);
          logger.debug(`[EntryFinder] Processing page components for: ${pagePath}`);
          for (const [alias, compPath] of Object.entries(pageJsonContent.usingComponents)) {
            if (typeof compPath === 'string') {
              // Use recursive helper and pass tracker
              findComponentEntriesRecursively(
                projectRoot,
                alias,
                compPath,
                pageDir,
                miniappRoot,
                entryPoints,
                processedComponentJsonPaths,
              );
            }
          }
        }
      } catch (e) {
        logger.warn(
          `[EntryFinder] Failed to read or parse page JSON: ${pageJsonPath}, Error: ${(e as Error).message}`,
        );
      }
    }
  }
}

/**
 * Helper to find and add component entry files (.js, .ts, .json) recursively.
 *
 * @param projectRoot Absolute path to the project root.
 * @param componentAlias The alias used in usingComponents.
 * @param componentPathValue The path value from usingComponents.
 * @param definingJsonDir Absolute path to the directory containing the JSON file where the component was defined.
 * @param miniappRoot Absolute path to the miniapp root (for resolving absolute paths starting with '/').
 * @param entryPoints The Set to add found entry points to.
 * @param processedComponentJsonPaths A Set to track processed component JSON paths for cycle detection.
 */
function findComponentEntriesRecursively(
  projectRoot: string,
  componentAlias: string,
  componentPathValue: string,
  definingJsonDir: string,
  miniappRoot: string,
  entryPoints: Set<string>,
  processedComponentJsonPaths: Set<string>,
): void {
  // Ignore plugin protocols or npm packages for now
  if (
    componentPathValue.startsWith('plugin://') ||
    componentPathValue.startsWith('plugin-private://') ||
    componentPathValue.startsWith('npm:')
  ) {
    logger.debug(
      `[EntryFinder] Skipping non-local component: ${componentAlias} -> ${componentPathValue}`,
    );
    return;
  }

  let componentBasePath: string;
  if (componentPathValue.startsWith('/')) {
    // Absolute path within miniapp root
    componentBasePath = path.resolve(miniappRoot, componentPathValue.substring(1));
  } else {
    // Relative path from the defining JSON's directory
    componentBasePath = path.resolve(definingJsonDir, componentPathValue);
  }

  // Always try to add .js and .ts files, considering both direct file and index file patterns
  const componentFilesToCheck = [
    `${componentBasePath}.js`, // e.g., components/comp.js
    `${componentBasePath}.ts`, // e.g., components/comp.ts
    path.join(componentBasePath, 'index.js'), // e.g., components/comp/index.js
    path.join(componentBasePath, 'index.ts'), // e.g., components/comp/index.ts
    // Add WXML and WXSS file patterns
    `${componentBasePath}.wxml`, // e.g., components/comp.wxml
    `${componentBasePath}.wxss`, // e.g., components/comp.wxss
    path.join(componentBasePath, 'index.wxml'), // e.g., components/comp/index.wxml
    path.join(componentBasePath, 'index.wxss'), // e.g., components/comp/index.wxss
  ];

  for (const compFile of componentFilesToCheck) {
    if (fs.existsSync(compFile)) {
      const relativePath = path.relative(projectRoot, compFile);
      // Avoid adding duplicates if both comp.js and comp/index.js exist (though unlikely)
      if (!entryPoints.has(relativePath)) {
        entryPoints.add(relativePath);
        logger.debug(
          `[EntryFinder] Found component script entry: ${componentAlias} -> ${relativePath}`,
        );
      }
    }
  }

  // --- Recursive part: Process the component's JSON file --- //
  // Check both direct json and index.json patterns
  const potentialJsonPaths = [
    `${componentBasePath}.json`,
    path.join(componentBasePath, 'index.json'),
  ];

  let actualComponentJsonPath: string | null = null;
  for (const p of potentialJsonPaths) {
    if (fs.existsSync(p)) {
      actualComponentJsonPath = p;
      logger.debug(`[EntryFinder] Found component JSON config at: ${actualComponentJsonPath}`);
      break; // Found the primary JSON config
    }
  }

  if (!actualComponentJsonPath) {
    // No JSON file found using either pattern, cannot find nested components
    logger.debug(
      `[EntryFinder] No JSON config found for component base path: ${componentBasePath}`,
    );
    return;
  }

  // Cycle detection using the actual found path
  if (processedComponentJsonPaths.has(actualComponentJsonPath)) {
    logger.debug(
      `[EntryFinder] Already processed component JSON (cycle detected?): ${actualComponentJsonPath}`,
    );
    return;
  }

  // Mark this component JSON as processed *before* recursive calls
  processedComponentJsonPaths.add(actualComponentJsonPath);
  logger.debug(`[EntryFinder] Processing component JSON: ${actualComponentJsonPath}`);

  // Add the actual JSON file itself as an entry point
  entryPoints.add(path.relative(projectRoot, actualComponentJsonPath));

  // Read and parse the component's JSON for its own usingComponents
  try {
    const componentJsonContent = JSON.parse(fs.readFileSync(actualComponentJsonPath, 'utf-8'));
    if (
      componentJsonContent?.usingComponents &&
      typeof componentJsonContent.usingComponents === 'object'
    ) {
      // Use the directory of the actual JSON file found
      const componentDir = path.dirname(actualComponentJsonPath);
      logger.debug(
        `[EntryFinder] Found nested usingComponents in: ${componentAlias} (${actualComponentJsonPath})`,
      );
      for (const [nestedAlias, nestedCompPath] of Object.entries(
        componentJsonContent.usingComponents,
      )) {
        if (typeof nestedCompPath === 'string') {
          // Recursive call
          findComponentEntriesRecursively(
            projectRoot,
            nestedAlias,
            nestedCompPath,
            componentDir, // Resolve nested components relative to *this* component's dir
            miniappRoot,
            entryPoints,
            processedComponentJsonPaths, // Pass the tracker down
          );
        }
      }
    }
  } catch (e) {
    logger.warn(
      `[EntryFinder] Failed to read or parse component JSON: ${actualComponentJsonPath}, Error: ${(e as Error).message}`,
    );
  }
}
