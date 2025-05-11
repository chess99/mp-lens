declare module '@wxml/parser' {
  // Primitive Type
  export interface Position {
    start: number;
    end: number;
    start: {
      line: number;
      column: number;
    };
    end: {
      line: number;
      column: number;
    };
    range: [number, number];
  }

  // WXInterpolation (same as WXAttributeInterpolation)
  export interface WXInterpolation extends Position {
    type: 'WXInterpolation';
    rawValue: string;
    value: string;
  }

  // WXText
  export interface WXText extends Position {
    type: 'WXText';
    value: string;
  }

  // WXComment
  export interface WXComment extends Position {
    type: 'WXComment';
    value: string;
  }

  // WXAttributeInterpolation (same as WXInterpolation)
  export type WXAttributeInterpolation = WXInterpolation;

  // WXAttribute
  export interface WXAttribute extends Position {
    type: 'WXAttribute';
    key: string;
    quote: "'" | '"';
    value: string | null;
    rawValue: string | null;
    children: Array<WXAttributeInterpolation | WXText>;
    interpolations: WXInterpolation[];
  }

  // WXStartTag
  export interface WXStartTag extends Position {
    type: 'WXStartTag';
    name: string;
    attributes: WXAttribute[];
    selfClosing: boolean;
  }

  // WXEndTag
  export interface WXEndTag extends Position {
    type: 'WXEndTag';
    name: string;
  }

  // WXScriptError (not detailed in doc, so use any)
  export type WXScriptError = any;
  // WXScriptProgram (not detailed in doc, so use any)
  export type WXScriptProgram = any;

  // WXScript
  export interface WXScript extends Position {
    type: 'WXScript';
    name: 'wxs';
    startTag: WXStartTag;
    endTag: WXEndTag | null;
    value: string | null;
    error: WXScriptError | undefined;
    body: [WXScriptProgram] | undefined;
  }

  // WXElement
  export interface WXElement extends Position {
    type: 'WXElement';
    name: string;
    children: WXNode[];
    startTag: WXStartTag;
    endTag: WXEndTag | null;
  }

  // WXLexerError
  export interface WXLexerError extends Position {
    type: 'WXLexerError';
    value: string;
  }

  // WXParseError
  export interface WXParseError extends Position {
    type: 'WXParseError';
    value: string;
    rawType: string;
  }

  // WXNode union
  export type WXNode = WXScript | WXElement | WXComment | WXText;

  // Program
  export interface Program extends Position {
    type: 'Program';
    body: WXNode[];
    comments: WXComment[];
    errors: Array<WXLexerError | WXParseError>;
    tokens: any[]; // placeholder for future feature
  }

  // parse function (default export)
  export function parse(source: string): Program;
}
