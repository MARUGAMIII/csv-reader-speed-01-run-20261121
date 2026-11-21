// Fast CSV reader, written from scratch from the csv-reader 1.0.0 specification
// (RULES.txt): single left-to-right pass, same answers {columns, rows, errors}
// for every {text, header} input, including every broken-row case.
//
// Speed comes from index-based field scans instead of a character at a time:
// each unquoted field is found with two indexOf calls (',' and the next line
// break), each quoted field with one indexOf ('"'), and field values are
// slices, never built up a character at a time. Two lazy cursors, nextCR and
// nextLF, track the next CR and LF at or after the scan position, so the
// stray-CR and embedded-break checks are integer compares instead of a fresh
// scan per field; a cursor resyncs only once it has been passed. Slow paths
// (stray CR, embedded line breaks, doubled quotes, junk after a closing
// quote, unterminated quotes) keep the exact reference semantics and only
// run where the input actually needs them.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// Reads an unquoted field starting at pos, with `init` already kept.
// Slow path: runs only when the field holds a stray CR (or runs to the end
// of the text). Returns {value, ended, added, pos, line}; `added` counts the
// characters kept during this read (used for the quote_junk check).
function readUnquoted(text, n, pos, line, init, recordLine, recordRow, errors) {
  let value = init;
  let added = 0;
  for (;;) {
    const c = text.indexOf(',', pos);
    const w = text.indexOf('\n', pos);
    let m;
    let comma;
    if (c === -1) { m = w; comma = false; }
    else if (w === -1) { m = c; comma = true; }
    else if (c < w) { m = c; comma = true; }
    else { m = w; comma = false; }
    if (m === -1) {
      const r = text.indexOf('\r', pos);
      if (r === -1) {
        value += text.slice(pos);
        added += n - pos;
        return { value, ended: END, added, pos: n, line };
      }
      // No ',' or '\n' follows, so this CR cannot be part of a CRLF.
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      value += text.slice(pos, r);
      added += r - pos;
      pos = r + 1;
      continue;
    }
    let end = m;
    if (!comma && m > pos && text.charCodeAt(m - 1) === 13) end = m - 1; // CRLF
    const r = text.slice(pos, end).indexOf('\r');
    if (r === -1) {
      value += text.slice(pos, end);
      added += end - pos;
      if (comma) return { value, ended: COMMA, added, pos: m + 1, line };
      return { value, ended: LINE_BREAK, added, pos: m + 1, line: line + 1 };
    }
    const rp = pos + r;
    errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
    value += text.slice(pos, rp);
    added += rp - pos;
    pos = rp + 1;
  }
}

// Reads a quoted field whose opening quote is at `open` (line `openLine`).
// Slow path: runs only when the field holds an embedded line break, a doubled
// quote, junk after its closing quote, or never closes. Returns like
// readUnquoted, with `value` the field's value.
function readQuotedSlow(text, n, open, openLine, recordLine, recordRow, errors) {
  let value = '';
  let pos = open + 1;
  let line = openLine;
  for (;;) {
    const q = text.indexOf('"', pos);
    if (q === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted(text, n, open + 1, openLine, '"', recordLine, recordRow, errors);
    }
    const inner = text.slice(pos, q);
    const ri = inner.indexOf('\r');
    const ni = inner.indexOf('\n');
    let e = -1;
    let eIsCR = false;
    if (ri !== -1 && (ni === -1 || ri < ni)) { e = ri; eIsCR = true; }
    else if (ni !== -1) { e = ni; }
    if (e !== -1) {
      // CRLF and a lone CR inside quotes are each one LF.
      value += inner.slice(0, e);
      value += '\n';
      line += 1;
      pos = pos + e + (eIsCR && text.charCodeAt(pos + e + 1) === 10 ? 2 : 1);
      continue;
    }
    value += inner;
    if (text.charCodeAt(q + 1) === 34) {
      value += '"';
      pos = q + 2;
      continue;
    }
    pos = q + 1;
    if (pos >= n) return { value, ended: END, added: 0, pos, line };
    const ch = text.charCodeAt(pos);
    if (ch === 44) return { value, ended: COMMA, added: 0, pos: pos + 1, line };
    if (ch === 10) return { value, ended: LINE_BREAK, added: 0, pos: pos + 1, line: line + 1 };
    if (ch === 13 && text.charCodeAt(pos + 1) === 10) {
      return { value, ended: LINE_BREAK, added: 0, pos: pos + 2, line: line + 1 };
    }
    // What follows the closing quote is appended as it stands.
    const junk = readUnquoted(text, n, pos, line, value, recordLine, recordRow, errors);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }
}

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1; // U+FEFF at the very start
  // Lazy cursors: next CR / LF at or after the scan position. -2 means never
  // synced, -1 means none remains (stable: pos only moves forward).
  let nextCR = -2;
  let nextLF = -2;

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended = END;
    let quoted = false;

    do {
      let value;
      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        const open = pos;
        const openLine = line;
        const p = pos + 1;
        const q = text.indexOf('"', p);
        if (q === -1) {
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          const r = readUnquoted(text, n, open + 1, openLine, '"', recordLine, recordRow, errors);
          value = r.value;
          ended = r.ended;
          pos = r.pos;
          line = r.line;
        } else {
          // Sync the cursors at p: they hold the first CR / LF at or after p.
          if (nextCR === -2 || (nextCR !== -1 && nextCR < p)) nextCR = text.indexOf('\r', p);
          if (nextLF === -2 || (nextLF !== -1 && nextLF < p)) nextLF = text.indexOf('\n', p);
          const hasBreak = (nextCR !== -1 && nextCR < q) || (nextLF !== -1 && nextLF < q);
          if (text.charCodeAt(q + 1) !== 34 && !hasBreak) {
            // Clean quoted field: no embedded break, no doubled quote.
            value = text.slice(p, q);
            pos = q + 1;
            if (pos >= n) {
              ended = END;
            } else {
              const ch = text.charCodeAt(pos);
              if (ch === 44) { pos += 1; ended = COMMA; }
              else if (ch === 10) { pos += 1; line += 1; ended = LINE_BREAK; }
              else if (ch === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; ended = LINE_BREAK; }
              else {
                const junk = readUnquoted(text, n, pos, line, value, recordLine, recordRow, errors);
                if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
                value = junk.value;
                ended = junk.ended;
                pos = junk.pos;
                line = junk.line;
              }
            }
          } else {
            const r = readQuotedSlow(text, n, open, openLine, recordLine, recordRow, errors);
            value = r.value;
            ended = r.ended;
            pos = r.pos;
            line = r.line;
          }
        }
      } else {
        quoted = false;
        // Sync the cursors at pos: nextLF is the next line break, nextCR the
        // next CR, each at or after pos.
        if (nextCR === -2 || (nextCR !== -1 && nextCR < pos)) nextCR = text.indexOf('\r', pos);
        if (nextLF === -2 || (nextLF !== -1 && nextLF < pos)) nextLF = text.indexOf('\n', pos);
        const c = text.indexOf(',', pos);
        let m;
        let comma;
        if (c === -1) { m = nextLF; comma = false; }
        else if (nextLF === -1) { m = c; comma = true; }
        else if (c < nextLF) { m = c; comma = true; }
        else { m = nextLF; comma = false; }
        if (m === -1) {
          if (nextCR === -1) {
            value = text.slice(pos);
            pos = n;
            ended = END;
          } else {
            const r = readUnquoted(text, n, pos, line, '', recordLine, recordRow, errors);
            value = r.value;
            ended = r.ended;
            pos = r.pos;
            line = r.line;
          }
        } else {
          let end = m;
          if (!comma && m > pos && text.charCodeAt(m - 1) === 13) end = m - 1; // CRLF
          if (nextCR === -1 || nextCR >= end) {
            value = text.slice(pos, end);
            if (comma) { pos = m + 1; ended = COMMA; }
            else { pos = m + 1; line += 1; ended = LINE_BREAK; }
          } else {
            const r = readUnquoted(text, n, pos, line, '', recordLine, recordRow, errors);
            value = r.value;
            ended = r.ended;
            pos = r.pos;
            line = r.line;
          }
        }
      }
      fields.push(value);
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
