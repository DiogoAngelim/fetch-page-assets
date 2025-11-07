import extractAssets, {
  h, p, d, m, u, w, $, E, g, A, F, P, R, D
} from './index';

describe('extractAssets', () => {
  it('should download and save a real image asset and update HTML', async () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tmp = require('fs').mkdtempSync(require('path').join(os.tmpdir(), 'fetch-assets-test-'));
    const imageUrl = 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png';
    const sampleHtml = `
      <html>
        <body>
          <img src="${imageUrl}">
        </body>
      </html>
    `;

    const logs = [];
    const origLog = console.log;
    const origError = console.error;
    console.log = (...args) => { logs.push(args.join(' ')); origLog(...args); };
    console.error = (...args) => { logs.push(args.join(' ')); origError(...args); };
    let updatedHtml;
    try {
      updatedHtml = await extractAssets(sampleHtml, { saveFile: true, verbose: true, basePath: tmp });
    } finally {
      console.log = origLog;
      console.error = origError;
    }

    if (logs.length) {
      origLog('[extractAssets test] Captured logs:', logs);
    }

    const expectedPath = path.join(tmp, 'images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png');
    if (!fs.existsSync(expectedPath)) {

      const walk = (dir) => {
        let results = [];
        const list = fs.readdirSync(dir);
        list.forEach((file) => {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat && stat.isDirectory()) {
            results = results.concat(walk(filePath));
          } else {
            results.push(filePath);
          }
        });
        return results;
      };
      const files = walk(path.join(tmp, 'images'));
      console.log('[extractAssets test] images dir contents:', files);
    }
    expect(fs.existsSync(expectedPath)).toBe(true);

    expect(updatedHtml).toContain('images/branding/googlelogo/2x/googlelogo_light_color_92x30dp.png');

    const rimrafSync = (targetPath) => {
      const fs = require('fs');
      if (!fs.existsSync(targetPath)) return;
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        fs.readdirSync(targetPath).forEach((file) => {
          rimrafSync(require('path').join(targetPath, file));
        });
        fs.rmdirSync(targetPath);
      } else {
        fs.unlinkSync(targetPath);
      }
    };
    rimrafSync(path.join(tmp, 'images'));

  });
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
