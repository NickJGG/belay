/**
 * Web page goldens: fetches a fixed URL list from a running site and writes each page's normalised DOM, one file per
 * URL, plus `/api/*` JSON. Serve master on 4949 and the branch on 4848 over the same working copy, then:
 *   test-env.sh <working> node scripts/goldens-pages.ts --base http://127.0.0.1:4949 --out <dir>
 *   test-env.sh <working> node scripts/goldens-pages.ts --base http://127.0.0.1:4848 --out <dir>
 * and `diff -r` the two dirs. Scripts, chunk links and CSS-module hashes are dropped, and times normalised. Usage rings
 * and Live tabs stay as they are: with no Claude session attached and no status line posting, both sides show none.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { args, need, normaliser } from './code.ts';

/** Masks what differs between two builds of the same page, then puts each tag on its own line. */
export function normalisePage(html: string, norm: (s: string) => string = (s) => s): string {
  const body = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\s(?:nonce|data-precedence|data-nimg|fetchPriority|crossorigin)="[^"]*"/gi, '')
    .replace(/(\s(?:src|href|srcSet)=")\/_next\/[^"]*"/gi, '$1<NEXT>"')
    .replace(/\sclass="([^"]*)"/g, (_, cls: string) => ` class="${cls.split(/\s+/).filter(Boolean).map(localClass).join(' ')}"`);
  return norm(body)
    .replace(/>\s*</g, '>\n<')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

/** A CSS-module class's local name: Turbopack's `file-module__hash__name`, or webpack's `file_name__hash`. */
export function localClass(c: string): string {
  return /^[\w-]+-module(?:-css)?__[\w-]+__([\w-]+)$/.exec(c)?.[1] ?? /^[A-Za-z][\w-]*?_([\w-]+)__[\w-]{5}$/.exec(c)?.[1] ?? c;
}

const firstCourse = (root: string) => readdirSync(root).filter((d) => !d.startsWith('.') && existsSync(join(root, d, 'syllabus.md'))).sort()[0];

if (import.meta.main) {
  const { flags } = args();
  if (typeof flags.base !== 'string' || typeof flags.out !== 'string') throw new Error('usage: goldens-pages.ts --base <url> --out <dir>');
  const norm = normaliser(dirname(need('BELAY_DATA')));
  const course = firstCourse(need('LEARNING_ROOT'));
  const PAGES = [
    '/',
    '/p',
    '/p/BEL',
    '/p/BEL/grills',
    '/p/BEL/activity',
    '/p/BEL/logs',
    '/p/FXT',
    '/p/unfiled',
    '/i/BEL-88',
    '/i/FXT-1',
    '/s/belay-plugin-architecture',
    '/learn',
    ...(course ? ['', '/map', '/lessons', '/notes', '/misconceptions', '/cards', '/work'].map((t) => `/learn/${course}${t}`) : []),
    '/nope',
    '/s/no-such-grill',
    '/p/NOPE',
    '/i/NOPE-1',
    '/learn/no-such-course',
    '/legacy/no-such-grill.md',
  ];
  const APIS = ['/api/search?q=grill', '/api/search?q=extension', '/api/search?q=lesson'];
  const out = flags.out;
  mkdirSync(out, { recursive: true });
  const file = (url: string) => join(out, `${url.replace(/^\//, '').replace(/[^\w.-]+/g, '_') || 'home'}.txt`);
  for (const url of PAGES) {
    const res = await fetch(new URL(url, flags.base), { redirect: 'manual' });
    writeFileSync(file(url), `${url}\nstatus ${res.status}\n${normalisePage(await res.text(), norm)}\n`);
  }
  for (const url of APIS) {
    const res = await fetch(new URL(url, flags.base));
    const text = await res.text();
    let body = text;
    try {
      body = JSON.stringify(JSON.parse(text), null, 2);
    } catch {}
    writeFileSync(file(url), `${url}\nstatus ${res.status}\n${norm(body)}\n`);
  }
  console.log(`${PAGES.length} pages, ${APIS.length} api calls in ${out}`);
}
