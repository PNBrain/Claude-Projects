/* Turns the text layer of the Blood on the Clocktower rulebook and character
 * almanac PDFs (as read by pdf.js) into structured data for the app:
 *   characters: { id: { ability, quote, overview[], examples[], howToRun[], extra[] } }
 *   editions:   { tb|bmr|snv|taf: { title, notes: [{t:'h'|'p', text}] } }
 *   rules:      [{ title, blocks: [{t:'h'|'p', text}] }]
 *   glossary:   [{ term, text }]
 * Input: one entry per PDF: { name, pages: [{ width, height, items: [{ str, x, y, w, size }] }] }
 * Works in the browser (window.BOTCLibrary) and in Node (require).
 */
(function (root) {
  'use strict';

  const NO_SPACE_BEFORE = /^[.,;:!?)\]’”'*—–]/;
  const NO_SPACE_AFTER = /[(\[“‘'’—–\s]$/;

  function joinParts(parts) {
    let s = '';
    for (const raw of parts) {
      const p = raw.replace(/\s+/g, ' ');
      if (!p.trim()) { if (s && !s.endsWith(' ')) s += ' '; continue; }
      if (!s) s = p.trimStart();
      else if (NO_SPACE_BEFORE.test(p.trimStart()) || NO_SPACE_AFTER.test(s)) s += p.trimStart();
      else s += ' ' + p.trimStart();
    }
    return s.replace(/\s+/g, ' ').trim();
  }
  const letters = (s) => s.toUpperCase().replace(/[^A-Z]/g, '');

  // ---------------------------------------------------------------- page → blocks
  function cleanItems(page) {
    const W = page.width;
    const items = page.items
      .filter((it) => it.str && it.str.trim())
      .filter((it) => it.y > 100) // running footer + page number
      .filter((it) => !(it.size >= 19 && it.size <= 21 && (it.x < 62 || it.x > W - 75))) // side tabs, page numbers
      .map((it) => ({ ...it }));
    // Drop caps: a single big letter that starts the line just beside it.
    const drops = items.filter((it) => it.size >= 23.5 && /^[A-Z]$/.test(it.str.trim()));
    for (const d of drops) {
      let best = null;
      for (const it of items) {
        if (it === d || drops.includes(it)) continue;
        if (it.x <= d.x || it.x > d.x + d.size * 1.6) continue;
        if (it.y < d.y - 3 || it.y > d.y + d.size * 0.8) continue;
        if (!best || it.y > best.y || (it.y === best.y && it.x < best.x)) best = it;
      }
      if (best) { best.str = d.str.trim() + best.str.trimStart(); best.x = d.x; d.str = ''; }
    }
    return items.filter((it) => it.str.trim());
  }

  function toLines(items) {
    const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of sorted) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= Math.max(2.5, Math.min(last.size, it.size) * 0.45)) {
        last.items.push(it);
        last.size = Math.max(last.size, it.size);
        last.minX = Math.min(last.minX, it.x);
      } else lines.push({ y: it.y, size: it.size, minX: it.x, items: [it] });
    }
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      l.text = joinParts(l.items.map((i) => i.str));
      // Dominant (most common by characters) body size of the line.
      // Body size of the line = size of its first real word (the "*" in "Each night*" is set larger).
      const first = l.items.find((i) => /[A-Za-z]{2}/.test(i.str)) || l.items[0];
      l.body = Math.round(first.size * 2) / 2;
    }
    return lines;
  }

  function linesToBlocks(lines) {
    const blocks = [];
    let prev = null;
    for (const l of lines) {
      const kind = l.size >= 13.5 ? 'h' : 'p';
      const cur = blocks[blocks.length - 1];
      const gap = prev ? prev.y - l.y : 0;
      const sizeChanged = prev && Math.abs(prev.body - l.body) >= 0.4 && Math.min(prev.body, l.body) >= 8.5;
      if (kind === 'p' && cur && cur.t === 'p' && prev && prev.size < 13.5 && gap > 0 && gap <= l.body * 1.55 && !sizeChanged) {
        cur.text = /[A-Za-z]-$/.test(cur.text) && /^[a-z]/.test(l.text) ? cur.text + l.text : joinParts([cur.text, l.text]);
      } else if (kind === 'h' && cur && cur.t === 'h' && prev && prev.size >= 13.5 && gap > 0 && gap <= l.size * 1.4 && Math.abs(prev.size - l.size) < 1) {
        cur.text = joinParts([cur.text, l.text]);
      } else {
        blocks.push({ t: kind, text: l.text, size: kind === 'h' ? l.size : l.body, x: l.minX, y: l.y });
      }
      prev = l;
    }
    return blocks;
  }

  // ---------------------------------------------------------------- small-caps repair
  // Small caps are letter-spaced in the PDFs, so "LIBRARIAN" can come out as "LIBR ARIAN".
  function buildDictionary(docs) {
    const words = new Map(); const bigrams = new Set();
    for (const d of docs) for (const p of d.pages) for (const it of p.items) {
      const toks = (it.str.toLowerCase().match(/[a-z’']+/g) || []);
      toks.forEach((t, i) => { words.set(t, (words.get(t) || 0) + 1); if (i) bigrams.add(toks[i - 1] + ' ' + t); });
    }
    return { words, bigrams };
  }
  function repairCaps(text, dict) {
    return text.replace(/\b[A-Z’']+(?: [A-Z’']+)+\b/g, (run) => {
      const toks = run.split(' ');
      const out = [toks[0]];
      for (let i = 1; i < toks.length; i++) {
        const a = out[out.length - 1]; const b = toks[i];
        const al = a.toLowerCase(); const bl = b.toLowerCase(); const cat = al + bl;
        const aWord = dict.words.has(al) && al.length > 1; const bWord = dict.words.has(bl) && bl.length > 1;
        if (dict.words.has(cat) && (!aWord || !bWord || !dict.bigrams.has(al + ' ' + bl))) out[out.length - 1] = a + b;
        else out.push(b);
      }
      return out.join(' ');
    });
  }

  // ---------------------------------------------------------------- almanac
  function titleItems(page) { return page.items.filter((it) => it.size >= 21.5 && it.size <= 23); }

  function columnsFor(page, items) {
    const W = page.width;
    const titles = titleItems({ items });
    const centred = titles.some((t) => Math.abs(t.x + (t.w || 0) / 2 - W / 2) < 60);
    if (centred) return [items];
    return [items.filter((it) => it.x < W / 2), items.filter((it) => it.x >= W / 2)];
  }

  function parseAlmanac(doc, CH, dict) {
    const nameToId = {};
    for (const id of Object.keys(CH)) nameToId[letters(CH[id].name)] = id;
    const entries = {}; const order = [];
    const notes = [];
    let current = null; let seenCharacter = false;
    for (const page of doc.pages) {
      const items = cleanItems(page);
      const hasTitle = titleItems({ items }).length > 0;
      if (!hasTitle) {
        // Edition introduction or suggested setups.
        if (!items.length) continue;
        for (const col of columnsFor(page, items)) {
          for (const b of linesToBlocks(toLines(col))) {
            const text = repairCaps(b.text, dict);
            const lettersOnly = text.replace(/[^A-Za-z]/g, '');
            if (lettersOnly.length < 12) continue; // stray punctuation from decorative pages
            if (b.t === 'p' && lettersOnly.length > 40 && !/[a-z]/.test(text)) continue; // all-caps flavour pages
            notes.push({ t: b.t, text, after: seenCharacter });
          }
        }
        continue;
      }
      seenCharacter = true;
      for (const col of columnsFor(page, items)) {
        for (const b of linesToBlocks(toLines(col))) {
          if (b.size >= 21.5 && b.size <= 23 && b.t === 'h') {
            const id = nameToId[letters(b.text)];
            if (id) { current = entries[id] = { id, blocks: [] }; order.push(id); continue; }
          }
          if (current) current.blocks.push({ ...b, text: repairCaps(b.text, dict) });
        }
      }
    }
    const characters = {};
    for (const id of order) characters[id] = shapeEntry(entries[id]);
    // Edition = the edition most of the parsed characters belong to.
    const counts = {};
    for (const id of order) { const e = CH[id].team === 'fabled' || CH[id].team === 'traveller' ? 'taf' : CH[id].edition; counts[e] = (counts[e] || 0) + 1; }
    const edition = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return { characters, edition: edition ? edition[0] : null, notes };
  }

  function shapeEntry(entry) {
    const out = { ability: '', quote: '', overview: [], examples: [], howToRun: [], extra: [] };
    let section = 'head';
    for (const b of entry.blocks) {
      if (b.t === 'h') {
        const h = b.text.toUpperCase().replace(/\s+/g, ' ');
        if (h === 'EXAMPLES' || h === 'EXAMPLE') section = 'examples';
        else if (h.startsWith('HOW TO RUN')) section = 'howToRun';
        else { out.extra.push({ title: b.text, paras: [] }); section = 'extra'; }
        continue;
      }
      if (section === 'head') {
        if (Math.abs(b.size - 9) < 0.3) { out.ability = joinParts([out.ability, b.text]); continue; }
        if (Math.abs(b.size - 10) < 0.3) { out.quote = joinParts([out.quote, b.text]); continue; }
        section = 'overview';
      }
      if (section === 'overview') out.overview.push(b.text);
      else if (section === 'examples') out.examples.push(b.text);
      else if (section === 'howToRun') out.howToRun.push(b.text);
      else if (section === 'extra') out.extra[out.extra.length - 1].paras.push(b.text);
    }
    return out;
  }

  // ---------------------------------------------------------------- rulebook
  function parseRulebook(doc, dict) {
    const sections = [];
    let sec = null;
    for (const page of doc.pages) {
      const items = cleanItems(page);
      const W = page.width;
      const isChapter = (it) => it.size >= 30 && it.size <= 36;
      // Group chapter-title items into titles (one per line), then cut the page into
      // horizontal bands at each title so a mid-page chapter starts where it should.
      const titles = toLines(items.filter(isChapter));
      const body = items.filter((it) => !isChapter(it));
      const cuts = [Infinity, ...titles.map((t) => t.y), -Infinity];
      for (let b = 0; b < cuts.length - 1; b++) {
        if (b > 0) { sec = { title: titleCase(titles[b - 1].text), blocks: [] }; sections.push(sec); }
        if (!sec) continue;
        const band = body.filter((it) => it.y < cuts[b] && it.y >= cuts[b + 1]);
        for (const col of [band.filter((it) => it.x < W / 2), band.filter((it) => it.x >= W / 2)]) {
          for (const bl of linesToBlocks(toLines(col))) {
            const text = repairCaps(bl.text, dict);
            if (bl.t === 'p' && text.split(' ').length < 4 && !/[.:!?]$/.test(text)) continue; // figure labels
            sec.blocks.push({ t: bl.t, text: bl.t === 'h' ? titleCase(text) : text });
          }
        }
      }
    }
    const glossary = [];
    const rules = [];
    for (const s of sections) {
      if (/^glossary$/i.test(s.title)) {
        for (const b of s.blocks) {
          const m = b.t === 'p' && b.text.match(/^([A-Z][A-Z0-9 ’'*/,-]{1,40}?[A-Z*]):\s*(.*)$/);
          if (m) glossary.push({ term: m[1], text: m[2] });
          else if (glossary.length && b.t === 'p') glossary[glossary.length - 1].text = joinParts([glossary[glossary.length - 1].text, b.text]);
        }
      } else if (s.blocks.length) rules.push(s);
    }
    return { rules, glossary };
  }
  function titleCase(s) {
    if (/[a-z]/.test(s)) return s;
    return s.toLowerCase().replace(/(^|[\s(“-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(And|Of|The|In|Is|To|A|At)\b(?!$)/g, (w, _x, i) => (i === 0 ? w : w.toLowerCase()));
  }

  // ---------------------------------------------------------------- entry point
  const EDITION_TITLES = { tb: 'Trouble Brewing', bmr: 'Bad Moon Rising', snv: 'Sects & Violets', taf: 'Travellers & Fabled' };
  function isRulebook(doc) {
    return doc.pages.some((p) => p.items.some((it) => it.size >= 30 && /GLOSSARY/.test(it.str)));
  }
  function parseDocs(docs, CH) {
    const dict = buildDictionary(docs);
    const out = { version: 1, importedAt: Date.now(), sources: [], characters: {}, editions: {}, rules: null, glossary: null };
    for (const doc of docs) {
      if (isRulebook(doc)) {
        const r = parseRulebook(doc, dict);
        out.rules = r.rules; out.glossary = r.glossary;
        out.sources.push({ name: doc.name, kind: 'rulebook', sections: r.rules.length, glossary: r.glossary.length });
        continue;
      }
      const a = parseAlmanac(doc, CH, dict);
      Object.assign(out.characters, a.characters);
      // Keep the Storyteller pages after the characters (suggested setups). The edition
      // introduction wraps around artwork and doesn't extract cleanly.
      const notes = a.notes.filter((n) => n.after).map(({ t, text }) => ({ t, text }));
      if (a.edition) out.editions[a.edition] = { title: EDITION_TITLES[a.edition] || a.edition, notes };
      out.sources.push({ name: doc.name, kind: 'almanac', edition: a.edition, characters: Object.keys(a.characters).length });
    }
    return out;
  }

  // Browser helper: read File objects with pdf.js into the page format above.
  async function readPdf(pdfjs, data, name) {
    const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      pages.push({
        width: vp.width, height: vp.height,
        items: tc.items.filter((it) => typeof it.str === 'string').map((it) => ({
          str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size: Math.hypot(it.transform[2], it.transform[3]),
        })),
      });
    }
    return { name, pages };
  }

  const api = { parseDocs, readPdf, joinParts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BOTCLibrary = api;
})(typeof window !== 'undefined' ? window : globalThis);
