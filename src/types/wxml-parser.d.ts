/**
 * Type declarations for @wxml/parser module
 */

declare module '@wxml/parser' {
  /**
   * Parse WXML content to AST
   * @param content WXML content
   * @returns AST representation of the WXML
   */
  export function parse(content: string): any;
}
