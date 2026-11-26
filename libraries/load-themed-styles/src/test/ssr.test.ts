// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This package is compiled without the Node.js typings, so declare the two functions used below.
interface INodeFs {
  readFileSync(path: string, encoding: 'utf8'): string;
}
interface INodeVm {
  runInNewContext(code: string, contextObject: object): unknown;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs: INodeFs = require('node:fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vm: INodeVm = require('node:vm');

type LoadThemedStyles = typeof import('../index');

/**
 * Evaluates the compiled library in a fresh context that has no `window` and no `document`, only a
 * Node.js-style `global`, as during server side rendering.
 *
 * (A `@jest-environment node` docblock is not an option here: it has to be the first comment of the
 * file, which is where the linter requires the copyright header.)
 */
function loadWithoutDom(): LoadThemedStyles {
  const sandbox: { exports: Partial<LoadThemedStyles>; global?: unknown } = { exports: {} };
  sandbox.global = sandbox;
  vm.runInNewContext(fs.readFileSync(String(require.resolve('../index')), 'utf8'), sandbox);
  return sandbox.exports as LoadThemedStyles;
}

describe('without a DOM', () => {
  let lts: LoadThemedStyles;

  beforeEach(() => {
    lts = loadWithoutDom();
  });

  it('does not throw from loadStyles or clearStyles', () => {
    expect(() => lts.loadStyles('.foo { color: "[theme:fooColor, default: #FFF]" }')).not.toThrow();
    expect(() => lts.loadStyles([{ rawString: '.bar { color: red }' }])).not.toThrow();
    expect(() => lts.clearStyles()).not.toThrow();
  });

  it('does not throw from flush with an empty buffer', () => {
    expect(() => lts.flush()).not.toThrow();
  });

  it('does not throw from loadTheme and still resolves tokens', () => {
    expect(() => lts.loadTheme({ fooColor: 'red' })).not.toThrow();
    expect(lts.detokenize('"[theme:fooColor, default: #FFF]"')).toEqual('red');

    expect(() => lts.loadTheme(undefined)).not.toThrow();
    expect(lts.detokenize('"[theme:fooColor, default: #FFF]"')).toEqual('#FFF');
  });

  it('passes resolved styles to the loadStyles override callback', () => {
    const callback: jest.Mock = jest.fn();
    lts.configureLoadStyles(callback);
    lts.loadTheme({ fooColor: 'red' });

    lts.loadStyles('.foo { color: "[theme:fooColor, default: #FFF]" }');

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toEqual('.foo { color: red }');
  });
});
