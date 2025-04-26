import * as path from 'path';
import { CommandOptions, ConfigFileOptions } from '../../src/types/command-options';
import { ConfigLoader } from '../../src/utils/config-loader';
import { logger } from '../../src/utils/debug-logger';
import { findAppJsonConfig } from '../../src/utils/fs-finder';
import { mergeOptions } from '../../src/utils/options-merger';

// Mock fs-finder
jest.mock('../../src/utils/fs-finder', () => ({
  findAppJsonConfig: jest.fn(),
}));

// Mock config-loader
jest.mock('../../src/utils/config-loader');

// Mock the logger
jest.mock('../../src/utils/debug-logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

// Type assertion for the mocked function
const mockedFindAppJsonConfig = findAppJsonConfig as jest.MockedFunction<typeof findAppJsonConfig>;

describe('mergeOptions', () => {
  const projectRoot = path.resolve('/project'); // Ensure absolute path
  const baseCliOptions: CommandOptions & { [key: string]: any } = {
    project: projectRoot,
    // other potential global CLI options
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    mockedFindAppJsonConfig.mockReturnValue(null); // Default to not finding anything
    (ConfigLoader.loadConfig as jest.Mock).mockResolvedValue(null); // Default to no config file
  });

  it('should use explicitly provided CLI options over config file and auto-detection', () => {
    const cliOptions = {
      ...baseCliOptions,
      miniappRoot: './cli_src', // Relative CLI path
      entryFile: 'cli_app.json', // Relative CLI path
    };
    const fileConfig: ConfigFileOptions = {
      miniappRoot: 'config_src',
      entryFile: 'config_app.json',
    };
    (ConfigLoader.loadConfig as jest.Mock).mockResolvedValue(fileConfig);

    const merged = mergeOptions(cliOptions, fileConfig, projectRoot);

    expect(merged.miniappRoot).toBe(path.resolve(projectRoot, 'cli_src'));
    expect(merged.entryFile).toBe(path.resolve(projectRoot, 'cli_app.json'));
    expect(mockedFindAppJsonConfig).not.toHaveBeenCalled();
  });

  it('should use config file options when CLI options are missing', () => {
    const cliOptions = { ...baseCliOptions }; // No specific paths
    const fileConfig: ConfigFileOptions = {
      miniappRoot: 'config_src',
      entryFile: 'config_app.json',
    };
    (ConfigLoader.loadConfig as jest.Mock).mockResolvedValue(fileConfig);

    const merged = mergeOptions(cliOptions, fileConfig, projectRoot);

    expect(merged.miniappRoot).toBe(path.resolve(projectRoot, 'config_src'));
    expect(merged.entryFile).toBe(path.resolve(projectRoot, 'config_app.json'));
    expect(mockedFindAppJsonConfig).not.toHaveBeenCalled();
  });

  it('should NOT call auto-detection if only miniappRoot is provided', () => {
    const cliOptions = {
      ...baseCliOptions,
      miniappRoot: './src',
    };
    const merged = mergeOptions(cliOptions, null, projectRoot);
    expect(merged.miniappRoot).toBe(path.resolve(projectRoot, 'src'));
    expect(merged.entryFile).toBeUndefined(); // entryFile remains undefined
    expect(mockedFindAppJsonConfig).not.toHaveBeenCalled();
  });

  it('should NOT call auto-detection if only entryFile is provided', () => {
    const cliOptions = {
      ...baseCliOptions,
      entryFile: 'my_app.json',
    };
    const merged = mergeOptions(cliOptions, null, projectRoot);
    expect(merged.miniappRoot).toBeUndefined(); // miniappRoot remains undefined
    expect(merged.entryFile).toBe(path.resolve(projectRoot, 'my_app.json'));
    expect(mockedFindAppJsonConfig).not.toHaveBeenCalled();
  });

  // --- Tests for Auto-Detection ---

  it('should call auto-detection when neither miniappRoot nor entryFile is provided', () => {
    const cliOptions = { ...baseCliOptions };
    mergeOptions(cliOptions, null, projectRoot);
    expect(mockedFindAppJsonConfig).toHaveBeenCalledTimes(1);
    expect(mockedFindAppJsonConfig).toHaveBeenCalledWith(projectRoot);
  });

  it('should use auto-detected paths when detection is successful', () => {
    const cliOptions = { ...baseCliOptions };
    const detectedPaths = {
      entryFile: path.resolve(projectRoot, 'detected_src/app.json'),
      miniappRoot: path.resolve(projectRoot, 'detected_src'),
    };
    mockedFindAppJsonConfig.mockReturnValue(detectedPaths);

    const merged = mergeOptions(cliOptions, null, projectRoot);

    expect(mockedFindAppJsonConfig).toHaveBeenCalledTimes(1);
    expect(merged.miniappRoot).toBe(detectedPaths.miniappRoot);
    expect(merged.entryFile).toBe(detectedPaths.entryFile);
  });

  it('should NOT use auto-detected paths when detection returns null', () => {
    const cliOptions = { ...baseCliOptions };
    mockedFindAppJsonConfig.mockReturnValue(null);

    const merged = mergeOptions(cliOptions, null, projectRoot);

    expect(mockedFindAppJsonConfig).toHaveBeenCalledTimes(1);
    expect(merged.miniappRoot).toBeUndefined();
    expect(merged.entryFile).toBeUndefined();
  });

  it('should NOT use auto-detected paths when detection returns "ambiguous"', () => {
    const cliOptions = { ...baseCliOptions };
    mockedFindAppJsonConfig.mockReturnValue('ambiguous');

    const merged = mergeOptions(cliOptions, null, projectRoot);

    expect(mockedFindAppJsonConfig).toHaveBeenCalledTimes(1);
    expect(merged.miniappRoot).toBeUndefined();
    expect(merged.entryFile).toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('ambiguity'));
  });

  it('should still use explicit CLI path even if auto-detection is triggered but fails', () => {
    // This scenario shouldn't happen with current logic (only triggers if both missing)
    // But adding for robustness / future changes
    const cliOptions = {
      ...baseCliOptions,
      miniappRoot: '/explicit/root', // Only one provided
    };
    // Even if detection ran (hypothetically) and failed
    mockedFindAppJsonConfig.mockReturnValue(null);

    const merged = mergeOptions(cliOptions, null, projectRoot);

    // Verify detection wasn't called (as per current logic)
    expect(mockedFindAppJsonConfig).not.toHaveBeenCalled();
    // Verify the explicit option was used
    expect(merged.miniappRoot).toBe('/explicit/root');
    expect(merged.entryFile).toBeUndefined();
  });

  // Add more tests for other option merging logic as needed (exclude, essentialFiles, etc.)
  // ...
});
