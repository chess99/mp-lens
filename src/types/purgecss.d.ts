declare module 'purgecss' {
  interface UserDefinedSafelist {
    standard?: (string | RegExp)[];
    deep?: RegExp[];
    greedy?: RegExp[];
    variables?: (string | RegExp)[];
    keyframes?: (string | RegExp)[];
  }

  interface PurgeCSSUserDefinedOptions {
    content: (string | { raw: string; extension: string })[];
    css: (string | { raw: string; name?: string })[];
    defaultExtractor?: (content: string) => string[];
    extractors?: { extractor: any; extensions: string[] }[];
    fontFace?: boolean;
    keyframes?: boolean;
    rejected?: boolean;
    rejectedCss?: boolean;
    safelist?: (string | RegExp)[] | UserDefinedSafelist;
    variables?: boolean;
    // stdin?: boolean; // Less common for programmatic use
    // stdout?: boolean; // Less common for programmatic use
    // config?: string; // For config file, not direct options
    // output?: string; // For CLI output, not programmatic return
  }

  interface PurgeCSSResult {
    css: string;
    file?: string;
    rejected?: string[];
    rejectedCss?: string;
  }

  export class PurgeCSS {
    constructor(); // In PurgeCSS v5, constructor typically does not take options.
    purge(options: PurgeCSSUserDefinedOptions): Promise<PurgeCSSResult[]>;
  }
}
