(function () {
  "use strict";
  const library = globalThis.AtelierLibrary;
  const paletteNames = ["Сирень", "Персик", "Мята"];
  const formats = { wide: [1200, 630], square: [1080, 1080], tall: [1080, 1350] };
  const defaults = { size: "L", format: "wide", palette: 0, custom: null, layout: "cluster", objects: [] };
  const id = () => globalThis.crypto.randomUUID();
  const xml = (s) => String(s).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const round = (n) => Math.round(n * 100) / 100;
  const normalize = (text) => text.toLowerCase().replaceAll("ё", "е");
  const words = (text) => normalize(text).match(/[а-яa-z\d]+/g) || [];
  const object = (key, state) => library.objects[key] || state.imports?.[key];
  const variant = (item, state) => object(item.key, state).variants[state.size][Number(item.mono)];
  const scale = (state) => {
    const [w, h] = formats[state.format];
    return Math.min(w, h) / (state.size === "L" ? 1710 : 855) * (state.layout === "title" ? 0.83 : 1);
  };

  const themes = [
    [/деньг|бюджет|финанс|расход|сбереж|покупк|накоп|инвест|прибыл/, ["wallet", "coin", "folder"]],
    [/музык|подкаст|плейлист|аудио|звук|слуш|тишин/, ["headphones", "phone", "flowers"]],
    [/собира|сложить|по част|из част|пазл|решени|команд/, ["puzzle", "phone", "book"]],
    [/свет|иде|ноч|озарени|вдохнов|фокус/, ["lamp", "pen", "book"]],
    [/чтен|книг|знани|обуч|учеб|роман|библиот/, ["book", "pen", "lamp"]],
    [/архив|документ|порядок|файл|договор/, ["folder", "pen", "wallet"]],
    [/весн|растен|цвет|природ|расцвет|рост|уют/, ["flowers", "book", "lamp"]],
  ];

  const stopWords = new Set(["как", "для", "или", "это", "что", "где", "при", "над", "под", "без", "про"]);

  function score(query, terms) {
    return words(query).reduce((sum, word) => {
      if (word.length < 3 || stopWords.has(word)) return sum;
      if (terms.includes(word)) return sum + 6;
      return sum + (terms.some((term) =>
        term.length >= 3 && (word.startsWith(term) || term.startsWith(word))) ? 3 : 0);
    }, 0);
  }

  function resolve(query, mode, state) {
    const entries = Object.entries({ ...library.objects, ...state.imports });
    const rank = (text) => entries.map(([key, item]) => ({
      key, score: score(text, words(item.name)) * 3 + score(text, words(item.terms)),
    })).sort((a, b) => b.score - a.score);
    if (mode === "objects") {
      const requested = query.split(/[,;\n]+|\s+и\s+/i).map((s) => s.trim()).filter(Boolean);
      const keys = [];
      const missing = [];
      for (const name of requested) {
        const exact = entries.find(([, item]) => normalize(item.name) === normalize(name));
        const best = rank(name)[0];
        if (exact) keys.push(exact[0]);
        else if (best?.score) keys.push(best.key);
        else missing.push(name);
      }
      return { keys, missing };
    }
    const ranked = rank(query).filter((result) => result.score).map((result) => result.key);
    const theme = themes.find(([pattern]) => pattern.test(normalize(query)))?.[1] || [];
    if (!ranked.length && !theme.length) return { keys: [], missing: [query] };
    return { keys: [...new Set([...ranked, ...theme, "pen", "flowers", "folder"])].slice(0, 3), missing: [] };
  }

  const anchors = {
    cluster: [[.53, .57], [.68, .28], [.27, .33], [.76, .72], [.23, .66], [.82, .43], [.44, .20], [.43, .84]],
    offset: [[.35, .64], [.72, .31], [.70, .69], [.29, .27], [.49, .26], [.80, .53], [.22, .79], [.55, .79]],
    title: [[.68, .64], [.82, .36], [.61, .27], [.90, .65], [.52, .77], [.72, .22], [.52, .46], [.78, .83]],
  };

  function compose(keys, state, mode) {
    const [width, height] = formats[state.format];
    const common = scale(state);
    const placed = [];
    const output = [];
    const layoutAnchors = anchors[state.layout];
    for (const [index, key] of keys.entries()) {
      const mono = mode === "phrase" && index === 2 && Boolean(library.objects[key]);
      const item = { id: id(), key, angle: 0, mono };
      const { box } = variant(item, state);
      const w = box[2] * common / width;
      const h = box[3] * common / height;
      const [ax, ay] = layoutAnchors[index % layoutAnchors.length];
      const candidates = [[ax, ay], ...Array.from({ length: 70 }, (_, i) => [
        .12 + (i % 10) * .083, .12 + Math.floor(i / 10) * .124,
      ])].map(([x, y]) => ({ x, y, w, h }));
      const overlap = (a, b) => Math.max(0, (a.w + b.w) / 2 - Math.abs(a.x - b.x))
        * Math.max(0, (a.h + b.h) / 2 - Math.abs(a.y - b.y));
      const outside = (a) => Math.max(0, (state.layout === "title" ? .43 : .05) - (a.x - a.w / 2))
        + Math.max(0, a.x + a.w / 2 - .95) + Math.max(0, .06 - (a.y - a.h / 2)) + Math.max(0, a.y + a.h / 2 - .94);
      const cost = (c) => Math.hypot(c.x - ax, c.y - ay) * 0.31 + outside(c) * 3
        + placed.reduce((sum, p) => sum + Math.max(0, overlap(c, p) / Math.min(c.w * c.h, p.w * p.h) - .13), 0);
      const best = candidates.reduce((winner, candidate) => cost(candidate) < cost(winner) ? candidate : winner);
      placed.push(best);
      output.push({ ...item, x: round(best.x * width), y: round(best.y * height) });
    }
    return output.sort((a, b) => Number(b.mono) - Number(a.mono));
  }

  function colorize(body, from, to) {
    const map = new Map(from.map((color, i) => [color.toLowerCase(), to[i]]));
    return body.replace(/((?:fill|stroke)=")(#[\da-f]{6}|white|black)"/gi,
      (original, attribute, color) => map.has(color.toLowerCase()) ? attribute + map.get(color.toLowerCase()) + '"' : original);
  }

  function palette(state) {
    return state.custom || library.palettes[state.palette];
  }

  function art(item, state, prefix = item.id) {
    const asset = variant(item, state);
    if (library.objects[item.key]) return colorize(asset.body, library.palettes[0], palette(state));
    return asset.body.replace(/((?:id|href)="#?|url\(#)svgref-/g,
      (_, reference) => reference + "svgref-" + prefix + "-");
  }

  function transform(item, state) {
    const [x, y, w, h] = variant(item, state).box;
    return `translate(${item.x} ${item.y}) rotate(${item.angle}) scale(${scale(state)}) translate(${-x - w / 2} ${-y - h / 2})`;
  }

  function background(state) {
    const [width, height] = formats[state.format];
    const index = state.custom ? 0 : state.palette;
    const source = library.backgrounds[state.size][index];
    const [x, y, w, h] = source.box;
    const body = state.custom ? colorize(source.body, library.palettes[index], palette(state)) : source.body;
    const factor = Math.max(width / w, height / h);
    const tx = (width - w * factor) / 2 - x * factor;
    const ty = (height - h * factor) / 2 - y * factor;
    return `<defs><clipPath id="paper-clip"><rect width="${width}" height="${height}"/></clipPath></defs><g clip-path="url(#paper-clip)" aria-hidden="true"><g transform="translate(${tx} ${ty}) scale(${factor})">${body}</g></g>`;
  }

  function layer(item, state) {
    return `<g transform="${transform(item, state)}">${art(item, state)}</g>`;
  }

  function svg(state, title) {
    const [w, h] = formats[state.format];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" overflow="hidden">
<title>${xml(title)}</title>
${background(state)}
${state.objects.map((item) => `<g id="${item.key}-${item.id}" aria-label="${xml(object(item.key, state).name)}">${layer(item, state)}</g>`).join("\n")}
</svg>\n`;
  }

  function importPalette(input) {
    const parse = (color) => {
      if (typeof color !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) throw Error("Укажите HEX-цвета, например #D7CDF5.");
      return color.length === 4 ? "#" + [...color.slice(1)].map((c) => c + c).join("") : color;
    };
    const groups = Array.isArray(input) ? [input.slice(0, 3), input.slice(3)] : [input?.background, input?.objects];
    if (groups.some((group) => !Array.isArray(group) || group.length !== 3)) throw Error("Нужны 3 цвета фона и 3 цвета объектов.");
    const [b, o] = groups.map((group) => group.map(parse));
    return [b[0], o[0], b[1], o[1], b[2], o[2], "#181817", "white"];
  }

  globalThis.Atelier = { paletteNames, formats, defaults, object, variant, scale, resolve, compose, art, transform, background, layer, svg, importPalette, palette, id, xml };
})();
