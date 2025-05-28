import * as fs from 'fs';
import { JSONParser } from '../../../src/analyzer/parsers/json-parser';

// Get actual path module *before* mocking
const actualPath = jest.requireActual('path');

// Mock fs
jest.mock('fs');

describe('JSONParser', () => {
  let parser: JSONParser;

  // Helper function to mock file content
  const mockFileContent = (filePath: string, content: string) => {
    (fs.readFileSync as jest.Mock).mockImplementation((file: string) => {
      const normalizedFile = actualPath.normalize(file);
      const normalizedTarget = actualPath.normalize(filePath);
      if (normalizedFile === normalizedTarget) {
        return content;
      }
      throw new Error(`File not found: ${file}`);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new JSONParser();
  });

  describe('parse', () => {
    it('should parse app.json pages and return page paths', async () => {
      const filePath = actualPath.resolve('/project', 'app.json');
      const fileContent = `{
        "pages": [
          "pages/index/index",
          "pages/logs/logs",
          "pages/user/profile"
        ]
      }`;

      const dependencies = await parser.parse(fileContent, filePath);

      expect(dependencies).toEqual([
        '/pages/index/index',
        '/pages/logs/logs',
        '/pages/user/profile',
      ]);
    });

    it('should parse app.json subpackages and return subpackage page paths', async () => {
      const filePath = actualPath.resolve('/project', 'app.json');
      const fileContent = `{
        "subpackages": [
          {
            "root": "package1",
            "pages": [
              "pages/index",
              "pages/detail"
            ]
          },
          {
            "root": "package2",
            "pages": [
              "pages/list"
            ]
          }
        ]
      }`;

      const dependencies = await parser.parse(fileContent, filePath);

      expect(dependencies).toEqual([
        '/package1/pages/index',
        '/package1/pages/detail',
        '/package2/pages/list',
      ]);
    });

    it('should parse app.json tabBar icon paths', async () => {
      const filePath = actualPath.resolve('/project', 'app.json');
      const fileContent = `{
        "tabBar": {
          "list": [
            {
              "pagePath": "pages/index/index",
              "text": "Home",
              "iconPath": "assets/home.png",
              "selectedIconPath": "assets/home-active.png"
            },
            {
              "pagePath": "pages/profile/profile",
              "text": "Profile",
              "iconPath": "assets/profile.png",
              "selectedIconPath": "assets/profile-active.png"
            }
          ]
        }
      }`;

      const dependencies = await parser.parse(fileContent, filePath);

      expect(dependencies).toEqual([
        'assets/home.png',
        'assets/home-active.png',
        'assets/profile.png',
        'assets/profile-active.png',
      ]);
    });

    it('should parse component.json usingComponents', async () => {
      const filePath = actualPath.resolve('/project', 'components/card/card.json');
      const fileContent = `{
        "component": true,
        "usingComponents": {
          "button": "../../common/button/button",
          "icon": "/components/icon/icon",
          "custom-tab-bar": "/custom-tab-bar/index"
        }
      }`;

      const dependencies = await parser.parse(fileContent, filePath);

      expect(dependencies).toEqual([
        '../../common/button/button',
        '/components/icon/icon',
        '/custom-tab-bar/index',
      ]);
    });

    it('should parse component.json componentGenerics', async () => {
      const filePath = actualPath.resolve('/project', 'components/generic/generic.json');
      const fileContent = `{
        "component": true,
        "componentGenerics": {
          "selectable": {
            "default": "../../common/selectable/selectable"
          },
          "item": {
            "default": "/components/item/item"
          }
        }
      }`;

      const dependencies = await parser.parse(fileContent, filePath);

      expect(dependencies).toEqual(['../../common/selectable/selectable', '/components/item/item']);
    });

    it('should handle mixed content in app.json', async () => {
      const filePath = actualPath.resolve('/project', 'app.json');
      const fileContent = `{
        "pages": [
          "pages/index/index",
          "pages/logs/logs"
        ],
        "subpackages": [
          {
            "root": "package1",
            "pages": [
              "pages/detail"
            ]
          }
        ],
        "tabBar": {
          "list": [
            {
              "pagePath": "pages/index/index",
              "iconPath": "assets/home.png",
              "selectedIconPath": "assets/home-active.png"
            }
          ]
        }
      }`;

      const dependencies = await parser.parse(fileContent, filePath);

      expect(dependencies).toEqual([
        '/pages/index/index',
        '/pages/logs/logs',
        '/package1/pages/detail',
        'assets/home.png',
        'assets/home-active.png',
      ]);
    });

    it('should skip plugin:// components', async () => {
      const filePath = actualPath.resolve('/project', 'components/test/test.json');
      const fileContent = `{
        "component": true,
        "usingComponents": {
          "plugin-component": "plugin://myPlugin/component",
          "normal-component": "../normal/normal"
        }
      }`;

      const dependencies = await parser.parse(fileContent, filePath);

      expect(dependencies).toEqual(['../normal/normal']);
    });

    it('should handle invalid JSON gracefully', async () => {
      const filePath = actualPath.resolve('/project', 'invalid.json');
      const fileContent = `{ invalid json content }`;

      const dependencies = await parser.parse(fileContent, filePath);

      expect(dependencies).toEqual([]);
    });

    it('should handle empty JSON', async () => {
      const filePath = actualPath.resolve('/project', 'empty.json');
      const fileContent = `{}`;

      const dependencies = await parser.parse(fileContent, filePath);

      expect(dependencies).toEqual([]);
    });
  });
});
