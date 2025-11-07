import extractAssets, {
  h, p, d, m, u, w, $, E, g, A, F, P, R, D
} from './index';

describe('extractAssets', () => {
  it('should be defined', () => {
    expect(extractAssets).toBeDefined();
  });
});

describe('h', () => {
  it('logs error when verbose', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
    h('fail', true);
    expect(spy).toHaveBeenCalledWith('[Error] fail');
    spy.mockRestore();
  });
  it('does not log error when not verbose', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
    h('fail', false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('p', () => {
  it('logs success when verbose', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
    p('ok', true);
    expect(spy).toHaveBeenCalledWith('[Success] ok');
    spy.mockRestore();
  });
  it('does not log success when not verbose', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
    p('ok', false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('d', () => {
  it('returns true for //url', () => {
    expect(d('//example.com')).toBe(true);
  });
  it('returns false for http url', () => {
    expect(d('http://example.com')).toBe(false);
  });
});

describe('m', () => {
  it('prepends protocol for //url', () => {
    expect(m('//example.com', 'https')).toBe('https://example.com');
  });
  it('returns url unchanged if not //', () => {
    expect(m('http://example.com', 'https')).toBe('http://example.com');
  });
});

describe('u', () => {
  it('returns true for trailing slash', () => {
    expect(u('abc/')).toBe(true);
  });
  it('returns false for no trailing slash', () => {
    expect(u('abc')).toBe(false);
  });
});

describe('w', () => {
  it('returns true for relative path', () => {
    expect(w('foo/bar.png')).toBe(true);
  });
  it('returns false for http url', () => {
    expect(w('http://example.com')).toBe(false);
  });
  it('returns false for //url', () => {
    expect(w('//example.com')).toBe(false);
  });
});

describe('$', () => {
  it('trims and removes quotes', () => {
    expect($(' "abc" ')).toBe('abc');
    expect($("'abc'")).toBe('abc');
    expect($('abc')).toBe('abc');
  });
});

describe('E', () => {
  it('resolves relative path to absolute', () => {
    expect(E('foo.png', 'https://site.com/', 'https')).toBe('https://site.com/foo.png');
  });
  it('returns protocol for //url', () => {
    expect(E('//cdn.com/img.png', '', 'https')).toBe('https://cdn.com/img.png');
  });
});

describe('g', () => {
  it('joins paths', () => {
    expect(g(['a', 'b', 'c'])).toBe('a/b/c');
  });
});

describe('A', () => {
  it('removes query and hash', () => {
    expect(A('file.png?x=1#hash')).toBe('file.png');
  });
});

describe('F', () => {
  it('joins and cleans path', () => {
    expect(F('a', 'b.png?x=1')).toBe('a/b.png');
  });
});

describe('P', () => {
  it('returns property by key or lowercase', () => {
    expect(P({ Foo: 1 }, 'Foo')).toBe(1);
    expect(P({ foo: 2 }, 'Foo')).toBe(2);
  });
});

describe('R', () => {
  it('returns filename from headers', () => {
    expect(R({ 'Content-Disposition': 'attachment; filename="x.png"' }, 'fallback.png')).toBe('x.png');
  });
  it('returns fallback if no filename', () => {
    expect(R({}, 'fallback.png')).toBe('fallback.png');
  });
});

describe('D', () => {
  it('logs progress', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
    D({ loaded: 50, total: 100 });
    expect(spy).toHaveBeenCalledWith('Download progress: 50%');
    spy.mockRestore();
  });
});
