# Technical Design: `mp-lens lint` Command

## 1. Overview and Goal

The `mp-lens lint` command is designed to analyze WeChat Mini Program projects to identify inconsistencies between custom component usage in `.wxml` files and their declarations in the corresponding `.json` configuration files.

The primary goals are:

- To detect custom components declared in a `.json` file's `usingComponents` but not actually used in the associated `.wxml` file ("declared but not used").
- To detect tags used in a `.wxml` file that appear to be custom components but are not declared in the associated `.json` file's `usingComponents` (and are not standard WXML tags) ("used but not declared").
- To provide clear, actionable reports to the developer.

## 2. Command Signature

The command will be invoked as:

```bash
mp-lens lint [path]
```

- `[path]` (optional): If provided, limits the linting process to the specified file (e.g., `src/pages/home/index.wxml` or `src/pages/home/index.json`) or directory. If a `.wxml` or `.json` file is specified, its counterpart is automatically included. If omitted, the entire miniapp project (as determined by `--miniapp-root` or `mp-lens.config.js`) is processed.
- No new command-specific options are introduced in this initial version. Global options like `--project`, `--miniapp-root`, `--verbose`, `--config` will be respected.

## 3. Core Utility Functions

### 3.1. WXML Tag Analysis

**`analyzeWxmlTags` (New Pure Function)**

```typescript
async function analyzeWxmlTags(
  wxmlFilePath: string, 
  pathResolver: PathResolver, 
  visited: Set<string> = new Set()
): Promise<Set<string>> {
  // Implementation details...
}
```

- **Purpose**: Analyzes a WXML file and all its imported/included templates recursively to extract all unique tag names used.
- **Parameters**:
  - `wxmlFilePath`: Path to the WXML file to analyze
  - `pathResolver`: An instance of `PathResolver` to resolve import/include paths
  - `visited`: Set of already visited files (to prevent infinite loops with circular imports)
- **Returns**: A `Set<string>` containing all unique tag names used in the WXML file and its imported templates
- **Implementation Details**:
  - Read the WXML file content
  - Use `@wxml/parser` to parse the content into an AST
  - Extract all element tag names from the AST
  - Identify `<import src="..."/>` and `<include src="..."/>` tags
  - For each imported/included template:
    - Resolve its path using the `PathResolver`
    - Recursively call `analyzeWxmlTags` with the resolved path
  - Handle generic components:
    - Find attributes that start with `generic:` prefix
    - Extract the attribute value as a component name
    - Add these components to the set of used tags
  - Aggregate and return all unique tag names

### 3.2. Component Linting

**`lintComponentUsage` (New Pure Function)**

```typescript
function lintComponentUsage(
  wxmlFilePath: string,
  jsonFilePath: string,
  usedTags: Set<string>,
  globalComponents: Record<string, string>,
  standardWxmlTags: Set<string>
): LintIssue {
  // Implementation details...
}
```

- **Purpose**: Performs the actual linting by comparing component declarations with their usage
- **Parameters**:
  - `wxmlFilePath`: Path to the WXML file
  - `jsonFilePath`: Path to the corresponding JSON file
  - `usedTags`: Set of all tags used in the WXML file (and its imported templates)
  - `globalComponents`: Object containing globally declared components from app.json
  - `standardWxmlTags`: Set of standard WXML tags to exclude from analysis
- **Returns**: A `LintIssue` object containing:
  - File paths for context
  - Arrays of "declared but not used" and "used but not declared" components
- **Implementation Details**:
  - Read and parse the JSON file to extract `usingComponents`
  - Merge local components with global components
  - Filter `usedTags` to exclude standard WXML tags
  - Find components declared but not used in WXML
  - Find tags used in WXML but not declared in JSON
  - Return structured results

## 4. Command Implementation

### 4.1. Command Orchestration (`LintCommand` module)

The `LintCommand` module will be responsible for:

1. Processing the command-line arguments
2. Reading the app.json to get global components
3. Creating a `PathResolver` instance
4. Determining the files/directories to process
5. Invoking the linting logic
6. Generating the report

### 4.2. Single Target Mode (When `[path]` is provided)

1. If `[path]` points to a file, identify its type:
   - If WXML, find the corresponding JSON file
   - If JSON, find the corresponding WXML file
   - Otherwise, show an error message

2. If `[path]` points to a directory, find all WXML/JSON file pairs in that directory:
   - We can leverage the existing `PathResolver` infrastructure for this task
   - Use Node.js `fs.readdirSync` to get all files in the directory
   - Filter by extension to find `.wxml` files
   - For each WXML file, check if a corresponding `.json` file exists (same basename)
   - Create pairs of WXML/JSON files for analysis

3. For each pair:
   - Call `analyzeWxmlTags` to get all tags used in the WXML
   - Call `lintComponentUsage` to compare tags with component declarations
   - Add results to the report

### 4.3. Whole Project Mode (When no `[path]` is provided)

1. Call `analyzeProject()` to get the complete project analysis
2. Extract all page and component nodes from the analysis
3. For each page/component:
   - Get the WXML file path
   - Get the JSON file path
   - Call `analyzeWxmlTags` to get all tags used in the WXML
   - Call `lintComponentUsage` to compare tags with component declarations
   - Add results to the report

## 5. Standard WXML Tags Identification

- A predefined list of standard WXML tags (e.g., `view`, `text`, `button`) will be maintained
- This list will be used by `lintComponentUsage` to filter out standard tags when identifying custom components
- The list should be comprehensive and updated according to official WeChat Mini Program documentation

## 6. Result Data Structure

```typescript
interface LintIssue {
  wxmlFile: string;
  jsonFile: string;
  declaredNotUsed: Array<{
    componentTag: string;
    path?: string;
  }>;
  usedNotDeclared: Array<{
    componentTag: string;
    suggestion?: string;
  }>;
}

interface LintResult {
  summary: {
    filesScanned: number;
    filesWithIssues: number;
    declaredNotUsedCount: number;
    usedNotDeclaredCount: number;
  };
  issues: LintIssue[];
}
```

## 7. Reporting Details

- **Console Output:**
  - Clear indication of which file is being analyzed.
  - `[WARNING]` for "Declared but not used" components, listing the component tag name.
  - `[ERROR]` for "Used but not declared" tags, listing the tag name.
  - A final summary: total files scanned, files with issues, total warnings, total errors.
  - Brief guidance on how to resolve common issues.

  Example output format:

  ```
  mp-lens lint

  Project: /path/to/your/project
  Miniapp Root: src

  Scanning component declarations and WXML usage...

  [INFO] src/pages/index/index:
    ✔ All component declarations match WXML usage.

  [WARNING] src/pages/profile/profile:
    - Declared but not used in WXML:
      - old-banner-component (declared in src/pages/profile/profile.json)
      - unused-widget (declared in src/pages/profile/profile.json)

  [ERROR] src/components/custom-card/custom-card:
    - Used in WXML but not declared in JSON:
      - special-icon (used in src/components/custom-card/custom-card.wxml)
        Suggestion: Is 'special-icon' a typo or a missing component declaration in custom-card.json?
    - Declared but not used in WXML:
      - legacy-button (declared in src/components/custom-card/custom-card.json)

  Summary:
    - Files Scanned: 25
    - Files with issues: 2
    - Total 'Declared but not used': 3 instances
    - Total 'Used but not declared': 1 instance

  Tips for resolution:
    - For "Declared but not used": Remove the component entry from the 'usingComponents' section in the .json file.
    - For "Used but not declared":
      1. Ensure the tag in .wxml is not a typo.
      2. If it's a valid custom component, add it to 'usingComponents' in the .json file with the correct path.
      3. Ensure you have a comprehensive list of native WXML tags if you are manually checking.
  ```

- **Internal Data Structure:**
  - The analysis results will be stored in a structured format internally, as defined in Section 6.
  - This structure is for internal use and not exposed via command options.

## 8. Implementation Strategy

1. **Create utility functions**:
   - `analyzeWxmlTags`: Pure function for recursive WXML tag analysis
     - Handle standard element tag names
     - Handle import/include tags for template analysis
     - Handle generic component usage with attributes starting with `generic:`
   - `lintComponentUsage`: Pure function for comparing declarations with usage

2. **Create command module**:
   - `lint.ts` in the `src/commands` directory
   - Implement command handling logic with conditional paths for targeted and whole project modes

3. **Integrate with existing project**:
   - Utilize existing `PathResolver` for path resolution
   - Leverage existing `analyzeProject()` for whole project analysis
   - Use existing CLI infrastructure for command registration and parameter handling

4. **Create tests**:
   - Unit tests for the utility functions
   - Integration tests for the command module
   - End-to-end tests for the command execution

## 9. Future Considerations

- **`--fix` option:** An interactive or automatic fixer to remove unused declarations from JSON or add stubs for used-but-not-declared components.
- **Integration with `clean` command:** The "declared but not used" information could potentially be used by an enhanced `clean` command.
- **Stricter checking for component paths:** Future enhancements could validate if the paths in `usingComponents` actually resolve to valid component files.
- **Configuration for standard tags:** Allow users to extend or override the list of known standard tags.

## 10. Dependencies

- **Core Dependencies**:
  - `@wxml/parser`: For parsing WXML files and generating ASTs
  - Existing project infrastructure: `PathResolver`, `analyzeProject()`
  - Node.js file system modules
  - JSON parsing utilities

- **Development Dependencies**:
  - Testing frameworks
  - Mocking utilities

## 11. Special Cases

### 11.1. Generic Components

WeChat Mini Program supports a feature called "generic components" which allows for more dynamic component registration. These are handled differently from standard components:

- In WXML, generic components are specified through attributes with the `generic:` prefix
- The value of these attributes references a component name that should be registered
- Example: `<custom-component generic:itemType="my-item" />`

The linting process must account for these generic component references:

1. During WXML analysis (`analyzeWxmlTags`), attributes starting with `generic:` will be identified
2. The attribute values will be treated as component names and added to the set of used components
3. These component names must be registered in the JSON file's `usingComponents` or `componentGenerics` section

This ensures complete coverage of both standard component usage and generic component references when performing lint checks.

## 12. Code Structure Organization

The implementation will be organized as follows:

```
src/
├── commands/
│   └── lint.ts               # Main command module
├── linter/
│   ├── wxml-analyzer.ts      # WXML tag analysis logic
│   ├── component-linter.ts   # Component usage comparison logic
│   ├── standard-wxml-tags.ts # List of standard WXML tags
│   └── types.ts              # TypeScript interfaces for the linter
└── utils/
    └── file-utils.ts         # Helper functions for file operations
```

### 12.1. Module Responsibilities

1. **`lint.ts`** (Main Command Module)
   - Registers the `lint` command
   - Processes command-line arguments
   - Orchestrates the linting process
   - Generates the final report

2. **`wxml-analyzer.ts`**
   - Contains the `analyzeWxmlTags` function
   - Handles WXML parsing using `@wxml/parser`
   - Processes imports and includes recursively
   - Identifies generic component usage

3. **`component-linter.ts`**
   - Contains the `lintComponentUsage` function
   - Compares component declarations with usage
   - Generates lint issues

4. **`standard-wxml-tags.ts`**
   - Maintains a comprehensive list of standard WXML tags
   - Provides utility functions for tag checking

5. **`types.ts`**
   - Defines TypeScript interfaces for lint issues and results
   - Ensures type safety across the linting modules

### 12.2. Code Flow

1. Command Initialization:

   ```typescript
   // src/commands/lint.ts
   export class LintCommand implements Command {
     name = 'lint';
     description = 'Analyze custom component usage in WXML files';
     
     async execute(args: string[], options: CommandOptions): Promise<void> {
       // Command implementation
     }
   }
   ```

2. WXML Analysis:

   ```typescript
   // src/linter/wxml-analyzer.ts
   export async function analyzeWxmlTags(
     wxmlFilePath: string,
     pathResolver: PathResolver,
     visited: Set<string> = new Set()
   ): Promise<Set<string>> {
     // Implementation
   }
   ```

3. Component Linting:

   ```typescript
   // src/linter/component-linter.ts
   export function lintComponentUsage(
     wxmlFilePath: string,
     jsonFilePath: string,
     usedTags: Set<string>,
     globalComponents: Record<string, string>,
     standardWxmlTags: Set<string>
   ): LintIssue {
     // Implementation
   }
   ```

## 13. Unit Test Plan

The testing strategy will cover unit tests, integration tests, and end-to-end tests to ensure comprehensive coverage of the linting functionality.

### 13.1. Unit Tests for Core Functions

#### WXML Tag Analysis Tests (`wxml-analyzer.test.ts`)

1. **Basic Tag Extraction**
   - Test with a simple WXML file containing only basic tags
   - Verify all tags are correctly extracted

2. **Template Import Handling**
   - Test with a WXML file that imports templates
   - Verify tags from imported templates are included
   - Mock the file system and PathResolver to simulate imports

3. **Circular Import Detection**
   - Test with WXML files that have circular imports
   - Verify the function handles this gracefully without infinite loops

4. **Generic Component Detection**
   - Test with WXML file containing `generic:` attributes
   - Verify these component references are correctly identified

5. **Error Handling**
   - Test with invalid WXML syntax
   - Test with non-existent import paths
   - Verify appropriate error handling

#### Component Linter Tests (`component-linter.test.ts`)

1. **"Declared but Not Used" Detection**
   - Test with components declared in JSON but not used in WXML
   - Verify these are correctly identified

2. **"Used but Not Declared" Detection**
   - Test with tags used in WXML but not declared in JSON
   - Verify these are correctly identified

3. **Standard Tag Filtering**
   - Test with standard WXML tags used in WXML
   - Verify these are not flagged as "used but not declared"

4. **Global Component Handling**
   - Test with components declared globally in app.json
   - Verify these are correctly considered as declared

5. **Generic Component Validation**
   - Test with generic components used and declared
   - Test with generic components used but not declared
   - Verify correct identification in both cases

### 13.2. Integration Tests

1. **Single File Analysis**
   - Test the complete flow with a single WXML/JSON pair
   - Verify correct linting results

2. **Directory Analysis**
   - Test with a directory containing multiple components
   - Verify all components are analyzed correctly

3. **Whole Project Analysis**
   - Test with a complete miniapp project structure
   - Verify integration with the existing project analysis
   - Verify all components across the project are linted

### 13.3. Test Files Structure

```
tests/
├── unit/
│   ├── linter/
│   │   ├── wxml-analyzer.test.ts
│   │   ├── component-linter.test.ts
│   │   └── fixtures/              # Test WXML and JSON files
│   └── commands/
│       └── lint.test.ts
└── integration/
    └── lint-command.test.ts
```

### 13.4. Test Data Setup

For thorough testing, we will create the following test fixtures:

1. **Simple Component Scenarios**
   - Basic WXML with standard tags only
   - WXML with custom components that are properly declared
   - WXML with custom components that are not declared
   - JSON with declared components that are not used

2. **Complex Scenarios**
   - WXML with template imports
   - WXML with circular template imports
   - WXML with generic component usage
   - Complete miniapp structure with multiple pages and components

3. **Edge Cases**
   - Malformed WXML
   - Malformed JSON
   - Empty files
   - Files with only comments
