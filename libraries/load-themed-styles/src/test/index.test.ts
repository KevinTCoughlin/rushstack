// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  detokenize,
  loadTheme,
  splitStyles,
  loadStyles,
  configureLoadStyles,
  clearStyles,
  replaceTokensWithVariables,
  type IThemingInstruction
} from '../index';

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
});

describe(loadStyles.name, () => {
  interface IWindowWithCSPSettings {
    CSPSettings?: { nonce?: string };
  }

  function getStyleElements(): HTMLStyleElement[] {
    return Array.from(document.querySelectorAll<HTMLStyleElement>('style[data-load-themed-styles]'));
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

  it('does not throw when document.body is null', () => {
    jest.spyOn(document, 'body', 'get').mockReturnValue(null as unknown as HTMLElement);

    expect(() => loadTheme({ color: 'red' })).not.toThrow();
    // The theme is still recorded and used to resolve tokens
    expect(detokenize('"[theme:color, default: #FFF]"')).toEqual('red');
  });
});
