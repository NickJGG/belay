import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localClass, normalisePage } from '../scripts/goldens-pages.ts';

test('CSS-module classes keep only their local name', () => {
  assert.equal(localClass('ambient-glow-module__VSvzVa__halo'), 'halo');
  assert.equal(localClass('page-module-css__a1B2c3__title'), 'title');
  assert.equal(localClass('rail_item__x9Y_z'), 'item');
  assert.equal(localClass('plain'), 'plain');
});

test('pages lose scripts, styles, links and chunk paths, one tag a line', () => {
  const html =
    '<html><head><link rel="stylesheet" href="/_next/static/a.css"><style>x{}</style></head>' +
    '<body><!-- c --><script>self.__next_f=1</script><div class="rail-module__Ab12Cd__item on">Hi</div>' +
    '<img src="/_next/image?x=1" nonce="n"></body></html>';
  assert.equal(
    normalisePage(html),
    ['<html>', '<head>', '</head>', '<body>', '<div class="item on">Hi</div>', '<img src="<NEXT>">', '</body>', '</html>'].join('\n'),
  );
});
