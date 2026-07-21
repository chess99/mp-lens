import * as path from 'path';
import { isPathWithinRoot } from '../../src/utils/path-containment';

describe('isPathWithinRoot', () => {
  it('uses POSIX path semantics for Linux and macOS paths', () => {
    expect(isPathWithinRoot('/repo', '/repo', path.posix)).toBe(true);
    expect(isPathWithinRoot('/repo', '/repo/components/button', path.posix)).toBe(true);
    expect(isPathWithinRoot('/repo', '/repo-next/component', path.posix)).toBe(false);
    expect(isPathWithinRoot('/repo', '/outside/component', path.posix)).toBe(false);
  });

  it('uses Windows path semantics and rejects paths on another drive', () => {
    expect(isPathWithinRoot('C:\\repo', 'C:\\repo', path.win32)).toBe(true);
    expect(isPathWithinRoot('C:\\repo', 'C:\\repo\\components\\button', path.win32)).toBe(true);
    expect(isPathWithinRoot('C:\\repo', 'C:\\repo-next\\component', path.win32)).toBe(false);
    expect(isPathWithinRoot('C:\\repo', 'D:\\components\\button', path.win32)).toBe(false);
  });
});
