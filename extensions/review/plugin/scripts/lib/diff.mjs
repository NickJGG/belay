// Unified-diff parsing and rendering. Rendered diffs carry real source line numbers, so a
// reviewer reading a packet file cites `src/x.ts:123`, never a line of the packet file.

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function unquote(path) {
  const m = /^"(.*)"$/.exec(path);
  return m ? m[1].replace(/\\(["\\])/g, '$1') : path;
}

function stripPrefix(path) {
  return unquote(path).replace(/^[ab]\//, '');
}

// `diff --git a/x b/x`, where neither path can be split on spaces alone.
function pathFromGitLine(line) {
  const rest = line.slice('diff --git '.length);
  const quoted = /^"?a\/(.+?)"? "?b\/(.+?)"?$/.exec(rest);
  if (!quoted) return null;
  const half = /^a\/(.+) b\/\1$/.exec(rest);
  return half ? half[1] : quoted[2];
}

// Returns [{path, oldPath, status, similarity, binary, insertions, deletions, hunks}], where a
// hunk is {oldStart, newStart, context, lines} and lines keep their ' ', '+', '-' or '\' prefix.
// insertions is null for a binary file, as `git diff --numstat` prints "-".
export function parseUnifiedDiff(text) {
  const files = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('diff --git ')) { i++; continue; }
    const file = { path: pathFromGitLine(lines[i]), oldPath: null, status: 'M', similarity: null, binary: false, insertions: 0, deletions: 0, hunks: [] };
    i++;
    let minus = null;
    let plus = null;
    while (i < lines.length && !lines[i].startsWith('diff --git ') && !lines[i].startsWith('@@ ')) {
      const line = lines[i].replace(/\r$/, '');
      if (line.startsWith('new file mode')) file.status = 'A';
      else if (line.startsWith('deleted file mode')) file.status = 'D';
      else if (line.startsWith('rename from ')) { file.status = 'R'; file.oldPath = unquote(line.slice(12)); }
      else if (line.startsWith('rename to ')) file.path = unquote(line.slice(10));
      else if (line.startsWith('copy from ')) { file.status = 'C'; file.oldPath = unquote(line.slice(10)); }
      else if (line.startsWith('copy to ')) file.path = unquote(line.slice(8));
      else if (line.startsWith('similarity index ')) file.similarity = Number.parseInt(line.slice(17), 10);
      else if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) file.binary = true;
      else if (line.startsWith('--- ')) minus = line.slice(4);
      else if (line.startsWith('+++ ')) plus = line.slice(4);
      i++;
    }
    if (plus && plus !== '/dev/null') file.path = stripPrefix(plus);
    else if (minus && minus !== '/dev/null') file.path = stripPrefix(minus);
    while (i < lines.length && lines[i].startsWith('@@ ')) {
      const m = HUNK.exec(lines[i].replace(/\r$/, ''));
      if (!m) break;
      const hunk = { oldStart: Number(m[1]), newStart: Number(m[3]), context: m[5].trim(), lines: [] };
      let oldLeft = m[2] === undefined ? 1 : Number(m[2]);
      let newLeft = m[4] === undefined ? 1 : Number(m[4]);
      i++;
      // Counting, not prefix-sniffing: a removed line may itself read "-- x" or "diff --git".
      while (i < lines.length && (oldLeft > 0 || newLeft > 0 || lines[i].startsWith('\\'))) {
        const line = lines[i].replace(/\r$/, '');
        if (line.startsWith('+')) { newLeft--; file.insertions++; }
        else if (line.startsWith('-')) { oldLeft--; file.deletions++; }
        else if (!line.startsWith('\\')) { oldLeft--; newLeft--; }
        hunk.lines.push(line);
        i++;
      }
      file.hunks.push(hunk);
    }
    if (file.binary) file.insertions = null;
    if (file.path) files.push(file);
  }
  return files;
}

export function addedText(file) {
  return file.hunks.flatMap((h) => h.lines.filter((l) => l.startsWith('+')).map((l) => l.slice(1))).join('\n');
}

function statusLabel(file) {
  const from = file.oldPath ? `, from ${file.oldPath}` : '';
  return `${file.status}, +${file.insertions ?? 0} -${file.deletions ?? 0}${from}`;
}

// New-side numbers on added and context lines. A removed line has no new-side number, so it stays
// bare, except in a deleted file, where the old side is all there is to cite.
export function renderDiff(file) {
  const out = [`=== ${file.path} (${statusLabel(file)}) ===`];
  for (const hunk of file.hunks) {
    out.push(`@@ ${hunk.context}`.trimEnd());
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    for (const line of hunk.lines) {
      const mark = line[0];
      if (mark === '\\') continue;
      if (mark === '+') out.push(`${String(newLine++).padStart(6)} +${line.slice(1)}`);
      else if (mark === '-') out.push(`${(file.status === 'D' ? String(oldLine) : '').padStart(6)} -${line.slice(1)}`);
      else out.push(`${String(newLine++).padStart(6)}  ${line.slice(1)}`);
      if (mark === '-' || mark === ' ' || mark === undefined) oldLine++;
    }
  }
  return `${out.join('\n')}\n`;
}

export function renderSnapshot(path, text) {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return `=== ${path} (${lines.length} lines) ===\n${lines.map((l, i) => `${String(i + 1).padStart(6)}  ${l}`).join('\n')}\n`;
}

// Splits at hunk boundaries where it can, at any line where it must, repeating the file header
// so each piece still names its file.
export function splitRendered(rendered, maxBytes) {
  if (Buffer.byteLength(rendered) <= maxBytes) return [rendered];
  const lines = rendered.split('\n');
  const header = lines[0];
  const pieces = [];
  let current = [];
  let size = 0;
  const flush = () => {
    if (current.length) pieces.push(current);
    current = [];
    size = 0;
  };
  for (const line of lines.slice(1)) {
    const bytes = Buffer.byteLength(line) + 1;
    if (size && (size + bytes > maxBytes || (line.startsWith('@@') && size > maxBytes / 2))) flush();
    current.push(line);
    size += bytes;
  }
  flush();
  return pieces.map((piece, i) => `${header.replace(/ ===$/, `, piece ${i + 1} of ${pieces.length} ===`)}\n${piece.join('\n').trimEnd()}\n`);
}

const STRING = /(['"`])(?:\\.|(?!\1).)*\1/g;
const STATIC_IMPORT = /^\s*(?:import\b[^(]*\bfrom\s*['"]|import\s*['"]|export\b.*\bfrom\s*['"]|\}\s*from\s*['"]|(?:const|let|var)\b.*=\s*require\(\s*['"])/;

function onlySpecifierChanged(removed, added) {
  return STATIC_IMPORT.test(removed)
    && STATIC_IMPORT.test(added)
    && removed.replace(STRING, "''").trim() === added.replace(STRING, "''").trim();
}

// An exact move, or a change that only rewrites module specifiers in static imports: what a
// typechecker and the tests settle. Dynamic import() is left out on purpose, as nothing checks it.
export function isMechanical(file) {
  if (file.binary) return false;
  if ((file.status === 'R' || file.status === 'C') && !file.hunks.length) return true;
  if (!file.hunks.length || file.status === 'A' || file.status === 'D') return false;
  const removed = [];
  const added = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('-')) removed.push(line.slice(1));
      else if (line.startsWith('+')) added.push(line.slice(1));
    }
  }
  return removed.length > 0
    && removed.length === added.length
    && removed.every((line, i) => onlySpecifierChanged(line, added[i]));
}

export function mechanicalSummary(files) {
  const moves = files.filter((f) => !f.hunks.length);
  const edits = files.filter((f) => f.hunks.length);
  const out = ['# Mechanical changes', '', 'Collapsed out of the diffs. Typecheck and the tests settle most of these; look for what they cannot: a path in a string, a config value or a dynamic import that still names an old location.', ''];
  if (moves.length) {
    out.push(`## Exact moves (${moves.length})`, '');
    for (const f of moves) out.push(`- ${f.oldPath} -> ${f.path}`);
    out.push('');
  }
  if (edits.length) {
    out.push(`## Import specifiers only (${edits.length})`, '');
    for (const f of edits) {
      out.push(f.oldPath ? `- ${f.oldPath} -> ${f.path}` : `- ${f.path}`);
      for (const hunk of f.hunks) for (const line of hunk.lines) if (line[0] === '-' || line[0] === '+') out.push(`  ${line}`);
    }
    out.push('');
  }
  return out.join('\n');
}
