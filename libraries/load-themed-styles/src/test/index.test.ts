// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  detokenize,
  loadTheme,
  splitStyles,
  loadStyles,
  configureLoadStyles,
  clearStyles,
  flush,
  ClearStyleOptions,
  replaceTokensWithVariables,
  type IThemingInstruction
} from '../index';

function getStyleElements(): HTMLStyleElement[] {
  return Array.from(document.querySelectorAll<HTMLStyleElement>('style[data-load-themed-styles]'));
}

describe(detokenize.name, () => {
  it('handles colors', () => {
    expect(detokenize('"[theme:name, default: #FFF]"')).toEqual('#FFF');
    expect(detokenize('"[theme: name, default: #FFF]"')).toEqual('#FFF');
    expect(detokenize('"[theme: name , default: #FFF  ]"')).toEqual('#FFF');
  });

  it('handles rgba', () => {
    expect(detokenize('"[theme:name, default: rgba(255,255,255,.5)]"')).toEqual('rgba(255,255,255,.5)');
  });

  it('handles fonts', () => {
    expect(detokenize('"[theme:name, default: "Segoe UI"]"')).toEqual('"Segoe UI"');
  });

  it('respects theme', () => {
    loadTheme({
      color: 'red'
    });

    try {
      expect(detokenize('"[theme:color, default: #FFF]"')).toEqual('red');
      expect(detokenize('"[theme: color , default: #FFF]"')).toEqual('red');
    } finally {
      loadTheme(undefined);
    }
  });

  it('ignores malformed themes', () => {
    expect(detokenize('"[theme:name, default: "Segoe UI"]')).toEqual('"[theme:name, default: "Segoe UI"]');
    expect(detokenize('"[theme:]"')).toEqual('"[theme:]"');
  });

  it('translates missing themes', () => {
    expect(detokenize('"[theme:name]"')).toEqual('inherit');
  });

  it('ignores tokens with unterminated quotes', () => {
    expect(detokenize('"[theme:name, default: #FFF]')).toEqual('"[theme:name, default: #FFF]');
    expect(detokenize('[theme:name, default: #FFF]"')).toEqual('[theme:name, default: #FFF]"');
    expect(detokenize('"[theme:name, default: #FFF"')).toEqual('"[theme:name, default: #FFF"');
  });

  it('ignores tokens with nested brackets', () => {
    expect(detokenize('"[theme:[theme:name]]"')).toEqual('"[theme:[theme:name]]"');
    expect(detokenize('"[theme:name, default: [#FFF]]"')).toEqual('"[theme:name, default: [#FFF]]"');
  });

  it('handles empty input', () => {
    expect(detokenize('')).toEqual('');
    expect(detokenize(undefined)).toBeUndefined();
  });
});

describe(replaceTokensWithVariables.name, () => {
  it('handles colors', () => {
    expect(replaceTokensWithVariables('"[theme:name, default: #FFF]"')).toEqual('var(--name, #FFF)');
    expect(replaceTokensWithVariables('"[theme: name, default: #FFF]"')).toEqual('var(--name, #FFF)');
    expect(replaceTokensWithVariables('"[theme: name , default: #FFF  ]"')).toEqual('var(--name, #FFF)');
  });

  it('handles rgba', () => {
    expect(replaceTokensWithVariables('"[theme:name, default: rgba(255,255,255,.5)]"')).toEqual(
      'var(--name, rgba(255,255,255,.5))'
    );
  });

  it('handles fonts', () => {
    expect(replaceTokensWithVariables('"[theme:name, default: "Segoe UI"]"')).toEqual(
      'var(--name, "Segoe UI")'
    );
  });

  it('ignores malformed themes', () => {
    expect(replaceTokensWithVariables('"[theme:name, default: "Segoe UI"]')).toEqual(
      '"[theme:name, default: "Segoe UI"]'
    );
    expect(replaceTokensWithVariables('"[theme:]"')).toEqual('"[theme:]"');
  });

  it('translates missing defaults', () => {
    expect(replaceTokensWithVariables('"[theme:name]"')).toEqual('var(--name)');
  });
});

describe(splitStyles.name, () => {
  it('splits non-themable CSS', () => {
    const cssString: string = '.sampleClass\n{\n color: #FF0000;\n}\n';
    const arr: IThemingInstruction[] = splitStyles(cssString);
    expect(arr).toHaveLength(1);
    expect(arr[0].rawString).toEqual(cssString);
  });

  it('splits themable CSS', () => {
    const arr: IThemingInstruction[] = splitStyles(
      '.firstClass { color: "[theme: firstColor ]";}\n' +
        ' .secondClass { color: "[theme:secondColor, default: #AAA]";}\n .coach { color: #333; }'
    );
    expect(arr).toHaveLength(5);
    for (let i: number = 0; i < arr.length; i++) {
      if (i % 2 === 0) {
        // even index should be a string component
        expect(typeof arr[i].rawString).toEqual('string');
      } else {
        // odd index should be a theme instruction object
        expect(typeof arr[i].theme).toEqual('string');
      }
    }
  });

  it('returns the same result when called repeatedly with the same input', () => {
    const cssString: string = '.a { color: "[theme:first, default: #AAA]"; background: "[theme:second]"; }';
    const first: IThemingInstruction[] = splitStyles(cssString);
    const second: IThemingInstruction[] = splitStyles(cssString);

    expect(first).toHaveLength(5);
    expect(second).toEqual(first);
  });

  it('starts from the beginning of the string after a previous call was interrupted', () => {
    const cssString: string = '"[theme:first, default: #AAA]" "[theme:second, default: #BBB]"';

    // Make the first result.push() inside splitStyles() throw, which leaves the shared regex mid-string.
    // Patching the prototype by hand is deliberate: a Jest spy records its calls with Array.prototype.push.
    /* eslint-disable no-extend-native */
    const originalPush: typeof Array.prototype.push = Array.prototype.push;
    let thrown: Error | undefined;
    Array.prototype.push = function (): number {
      Array.prototype.push = originalPush;
      throw new Error('push failed');
    };
    try {
      splitStyles(cssString);
    } catch (e) {
      thrown = e as Error;
    } finally {
      Array.prototype.push = originalPush;
    }
    /* eslint-enable no-extend-native */
    expect(thrown?.message).toEqual('push failed');

    expect(splitStyles(cssString)).toEqual([
      { theme: 'first', defaultValue: '#AAA' },
      { rawString: ' ' },
      { theme: 'second', defaultValue: '#BBB' },
      { rawString: '' }
    ]);
  });
});

describe(loadStyles.name, () => {
  interface IWindowWithCSPSettings {
    CSPSettings?: { nonce?: string };
  }

  afterEach(() => {
    clearStyles();
    delete (window as IWindowWithCSPSettings).CSPSettings;
  });

  it('does not set a nonce when CSPSettings is not defined', () => {
    loadStyles('.foo { color: red }');

    const styleElements: HTMLStyleElement[] = getStyleElements();
    expect(styleElements).toHaveLength(1);
    expect(styleElements[0].hasAttribute('nonce')).toEqual(false);
  });

  it('appends the style element to document.head', () => {
    loadStyles('.foo { color: red }');

    const styleElements: HTMLStyleElement[] = getStyleElements();
    expect(styleElements).toHaveLength(1);
    expect(styleElements[0].parentElement).toBe(document.head);
    expect(styleElements[0].textContent).toEqual('.foo { color: red }');
  });

  it('dispatches a "styleinsert" event with the new style element', () => {
    const listener: jest.Mock = jest.fn();
    document.addEventListener('styleinsert', listener);
    try {
      loadStyles('.foo { color: red }');
    } finally {
      document.removeEventListener('styleinsert', listener);
    }

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].args.newStyle).toBe(getStyleElements()[0]);
  });

  it('resolves theme tokens in the inserted style element', () => {
    loadTheme({ fooColor: 'red' });
    try {
      loadStyles(
        '.foo { color: "[theme:fooColor, default: #FFF]"; background: "[theme:fooBg, default: #000]" }'
      );
      expect(getStyleElements().map((element: HTMLStyleElement) => element.textContent)).toEqual([
        '.foo { color: red; background: #000 }'
      ]);
    } finally {
      loadTheme(undefined);
      document.body.removeAttribute('style');
    }
  });

  it('accepts a pre-split ThemableArray', () => {
    loadStyles([
      { rawString: '.foo { color: ' },
      { theme: 'fooColor', defaultValue: '#FFF' },
      { rawString: ' }' }
    ]);

    expect(getStyleElements().map((element: HTMLStyleElement) => element.textContent)).toEqual([
      '.foo { color: #FFF }'
    ]);
  });

  describe('in async mode', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      flush();
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('buffers styles until the flush timer fires', () => {
      loadStyles('.foo { color: red }', true);
      loadStyles('.bar { color: blue }', true);
      expect(getStyleElements()).toHaveLength(0);

      jest.runOnlyPendingTimers();

      expect(getStyleElements().map((element: HTMLStyleElement) => element.textContent)).toEqual([
        '.foo { color: red }.bar { color: blue }'
      ]);
    });

    it('registers many buffered styles as a single element, in order, on flush()', () => {
      const expected: string[] = [];
      for (let i: number = 0; i < 200; i++) {
        const css: string = `.class${i} { color: red }`;
        expected.push(css);
        loadStyles(css, true);
      }
      expect(getStyleElements()).toHaveLength(0);

      flush();

      expect(getStyleElements().map((element: HTMLStyleElement) => element.textContent)).toEqual([
        expected.join('')
      ]);

      // The pending timer finds an empty buffer and must not insert the styles a second time
      jest.runOnlyPendingTimers();
      expect(getStyleElements()).toHaveLength(1);
    });

    it('does nothing when flush() is called with an empty buffer', () => {
      flush();
      expect(getStyleElements()).toHaveLength(0);
    });

    it('applies a theme that is loaded while styles are still buffered', () => {
      loadStyles('.foo { color: "[theme:fooColor, default: #FFF]" }', true);
      loadTheme({ fooColor: 'red' });
      try {
        expect(getStyleElements()).toHaveLength(0);

        flush();

        expect(getStyleElements().map((element: HTMLStyleElement) => element.textContent)).toEqual([
          '.foo { color: red }'
        ]);
      } finally {
        loadTheme(undefined);
        document.body.removeAttribute('style');
      }
    });
  });

  it('reads the CSP nonce when the style element is inserted', () => {
    // CSPSettings is defined after the module has been loaded
    (window as IWindowWithCSPSettings).CSPSettings = { nonce: 'first-nonce' };
    loadStyles('.foo { color: red }');

    (window as IWindowWithCSPSettings).CSPSettings = { nonce: 'second-nonce' };
    loadStyles('.bar { color: blue }');

    const styleElements: HTMLStyleElement[] = getStyleElements();
    expect(styleElements).toHaveLength(2);
    expect(styleElements[0].getAttribute('nonce')).toEqual('first-nonce');
    expect(styleElements[1].getAttribute('nonce')).toEqual('second-nonce');
  });

  it('passes the styles to loadStyles override callback', () => {
    const expected: string = 'xxx.foo { color: #FFF }xxx';
    let subject: string | undefined = undefined;

    const callback: (str: string) => void = (str: string) => {
      subject = 'xxx' + str + 'xxx';
    };

    configureLoadStyles(callback);

    loadStyles('.foo { color: "[theme:fooColor, default: #FFF]" }');
    expect(subject).toEqual(expected);

    configureLoadStyles(undefined);
  });
});

describe(loadTheme.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
    loadTheme(undefined);
    clearStyles();
    document.body.removeAttribute('style');
  });

  it('sets CSS variables on document.body', () => {
    loadTheme({ color: 'red', background: 'blue' });

    expect(document.body.style.getPropertyValue('--color')).toEqual('red');
    expect(document.body.style.getPropertyValue('--background')).toEqual('blue');
  });

  it('accepts an undefined theme', () => {
    expect(() => loadTheme(undefined)).not.toThrow();
    expect(document.body.getAttribute('style')).toBeNull();
    expect(detokenize('"[theme:color, default: #FFF]"')).toEqual('#FFF');
  });

  it('accepts an empty theme', () => {
    expect(() => loadTheme({})).not.toThrow();
    expect(document.body.getAttribute('style')).toBeNull();
    expect(detokenize('"[theme:color, default: #FFF]"')).toEqual('#FFF');
  });

  it('accepts a theme without a prototype', () => {
    const theme: Record<string, string> = Object.create(null);
    theme.color = 'red';

    expect(() => loadTheme(theme)).not.toThrow();
    expect(document.body.style.getPropertyValue('--color')).toEqual('red');
  });

  it('accepts a theme slot named "hasOwnProperty"', () => {
    expect(() => loadTheme({ hasOwnProperty: 'red' })).not.toThrow();
    expect(document.body.style.getPropertyValue('--hasOwnProperty')).toEqual('red');
  });

  it('ignores inherited theme slots when setting CSS variables', () => {
    const theme: Record<string, string> = Object.create({ inherited: 'blue' });
    theme.color = 'red';

    loadTheme(theme);
    expect(document.body.style.getPropertyValue('--color')).toEqual('red');
    expect(document.body.style.getPropertyValue('--inherited')).toEqual('');
  });

  it('re-renders registered themable styles and leaves non-themable styles alone', () => {
    loadStyles('.plain { color: black }');
    loadStyles('.themed { color: "[theme:color, default: #FFF]" }');
    const [plainElement, themedElement] = getStyleElements();
    expect(themedElement.textContent).toEqual('.themed { color: #FFF }');

    loadTheme({ color: 'red' });

    const styleElements: HTMLStyleElement[] = getStyleElements();
    expect(styleElements).toHaveLength(2);
    expect(styleElements[0]).toBe(plainElement);
    expect(styleElements[1]).not.toBe(themedElement);
    expect(styleElements[1].textContent).toEqual('.themed { color: red }');
    expect(themedElement.parentElement).toBeNull();
  });

  it('does not accumulate style elements when the theme changes repeatedly', () => {
    loadStyles('.plain { color: black }');
    loadStyles('.themedA { color: "[theme:color, default: #FFF]" }');
    loadStyles('.themedB { background: "[theme:color, default: #FFF]" }');
    expect(getStyleElements()).toHaveLength(3);

    for (let i: number = 0; i < 50; i++) {
      loadTheme({ color: `rgb(${i}, 0, 0)` });
      // One non-themable element, plus the themable styles merged into a single element
      expect(getStyleElements()).toHaveLength(2);
    }

    expect(getStyleElements()[1].textContent).toEqual(
      '.themedA { color: rgb(49, 0, 0) }.themedB { background: rgb(49, 0, 0) }'
    );
  });

  it('does not throw when document.body is null', () => {
    jest.spyOn(document, 'body', 'get').mockReturnValue(null as unknown as HTMLElement);

    expect(() => loadTheme({ color: 'red' })).not.toThrow();
    // The theme is still recorded and used to resolve tokens
    expect(detokenize('"[theme:color, default: #FFF]"')).toEqual('red');
  });
});

describe(clearStyles.name, () => {
  beforeEach(() => {
    loadStyles('.plain { color: black }');
    loadStyles('.themed { color: "[theme:color, default: #FFF]" }');
  });

  afterEach(() => {
    clearStyles();
  });

  it('removes all registered style elements by default', () => {
    expect(getStyleElements()).toHaveLength(2);

    clearStyles();

    expect(getStyleElements()).toHaveLength(0);
  });

  it('removes only themable styles', () => {
    clearStyles(ClearStyleOptions.onlyThemable);

    expect(getStyleElements().map((element: HTMLStyleElement) => element.textContent)).toEqual([
      '.plain { color: black }'
    ]);
  });

  it('removes only non-themable styles', () => {
    clearStyles(ClearStyleOptions.onlyNonThemable);

    expect(getStyleElements().map((element: HTMLStyleElement) => element.textContent)).toEqual([
      '.themed { color: #FFF }'
    ]);
  });

  it('tolerates style elements that were already removed from the document', () => {
    getStyleElements().forEach((element: HTMLStyleElement) => element.remove());

    expect(() => clearStyles()).not.toThrow();
  });
});
