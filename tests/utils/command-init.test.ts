import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initializeCommandContext } from '../../src/utils/command-init';

function createFixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-lens-command-init-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  }
  return root;
}

describe('initializeCommandContext', () => {
  it('uses --entry-file as the app.json entry path', async () => {
    const root = createFixture({
      'app.json': JSON.stringify({ pages: ['pages/default/default'] }),
      'custom-entry.json': JSON.stringify({ pages: ['pages/custom/custom'] }),
    });

    const context = await initializeCommandContext({
      project: root,
      miniappRoot: '.',
      entryFile: 'custom-entry.json',
      verbose: false,
      verboseLevel: 0,
    });

    expect(context.appJsonPath).toBe(path.join(root, 'custom-entry.json'));
    expect(context.appJsonContent).toEqual({ pages: ['pages/custom/custom'] });
  });
});
