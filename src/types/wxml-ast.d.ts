export interface WXAttribute {
  key: string;
  value: string;
}

export interface WXStartTag {
  name: string;
  attributes: WXAttribute[];
  selfClosing: boolean;
  start: number;
  end: number;
}

export interface WXElement {
  type: 'WXElement';
  name: string;
  startTag: WXStartTag;
  endTag: WXStartTag | null;
  children: WXElement[];
  // ... 其它字段可按需补充
}
