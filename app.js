(function () {
  "use strict";
  const api = globalThis.Atelier;
  const lib = globalThis.AtelierLibrary;
  const $ = (id) => document.getElementById(id);
  const storageKey = "svg-atelier-v1";
  const demos = [
    { label: "Из частей в целое", mode: "phrase", query: "Из частей в целое", palette: 0, size: "L", format: "wide", layout: "cluster" },
    { label: "Тишина в наушниках", mode: "phrase", query: "Тишина в наушниках", palette: 2, size: "S", format: "square", layout: "offset" },
    { label: "Папка, ручка, монета", mode: "objects", query: "Папка, ручка, монета", palette: 1, size: "L", format: "tall", layout: "title" },
  ];
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && Array.isArray(saved.objects)) return { ...api.defaults, ...saved };
    } catch {}
    const state = { ...api.defaults, query: demos[0].query, mode: demos[0].mode };
    state.objects = api.compose(api.resolve(state.query, state.mode, state).keys, state, state.mode);
    return state;
  }

  let state = load();
  let selected = null;
  let drag = null;
  const canvas = $("canvas");
  const persist = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
  };
  const status = (message = "") => { $("status").textContent = message; };
  const select = (id) => {
    selected = id;
    $("layers").querySelectorAll("[data-layer]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.layer === id));
    });
    drawInspector();
    drawSelection();
  };

  function thumb(key, mono = false) {
    const item = { key, mono };
    const { box } = api.variant(item, state);
    return `<svg aria-hidden="true" fill="none" viewBox="${box.join(" ")}">${api.art(item, state, "thumb-" + api.id())}</svg>`;
  }

  function tools() {
    $("format").value = state.format;
    $("size").value = state.size;
    $("layout").value = state.layout;
    $("query").value = state.query || "";
    const isPhrase = state.mode === "phrase";
    $("query").placeholder = isPhrase ? "Например, «Из частей в целое»" : "Например, «Папка, ручка, монета»";
    $("query-label").textContent = isPhrase ? "Заголовок или метафора" : "Список объектов через запятую";
    document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === state.mode));
  }

  function drawAssets() {
    const query = $("search").value.trim().toLowerCase().replaceAll("ё", "е");
    const items = Object.entries({ ...lib.objects, ...state.imports });
    const filtered = items.filter(([, entry]) => entry.name.toLowerCase().replaceAll("ё", "е").includes(query));
    $("count").textContent = filtered.length === items.length ? items.length : `${filtered.length} / ${items.length}`;
    $("assets").innerHTML = filtered.map(([key, entry]) =>
      `<button class="asset" data-key="${key}" title="Добавить: ${api.xml(entry.name)}">${thumb(key)}<span>${api.xml(entry.name)}</span></button>`).join("");
  }

  function drawPalettes() {
    const all = lib.palettes.map((colors, i) => [api.paletteNames[i], colors, i]);
    if (state.customColors) all.push(["Своя палитра", state.customColors, "custom"]);
    $("palette-list").innerHTML = all.map(([name, colors, key]) =>
      `<button data-palette="${key}" class="palette-option" aria-pressed="${state.custom ? key === "custom" : key === state.palette}">
      <span class="swatches" aria-hidden="true">${colors.slice(0, 6).map((c) => `<i style="background:${c}"></i>`).join("")}</span>${name}</button>`).join("");
  }

  function drawCanvas() {
    const [w, h] = api.formats[state.format];
    canvas.setAttribute("viewBox", `0 0 ${w} ${h}`);
    canvas.setAttribute("width", w);
    canvas.setAttribute("height", h);
    canvas.style.setProperty("--canvas-ratio", w / h);
    canvas.innerHTML = api.background(state) + state.objects.map((item) =>
      `<g class="scene-item" data-layer="${item.id}" transform="${api.transform(item, state)}">${api.art(item, state)}</g>`).join("")
      + '<g id="selection-outline" aria-hidden="true"></g>';
    $("dimensions").textContent = `${w} × ${h} px`;
    $("export").disabled = !state.objects.length;
    $("clear").disabled = !state.objects.length;
    drawSelection();
  }

  function drawSelection() {
    const item = state.objects.find((x) => x.id === selected);
    const selection = $("selection-outline");
    if (!selection) return;
    if (!item) {
      selection.replaceChildren();
      return;
    }
    const [x, y, w, h] = api.variant(item, state).box;
    const pad = 7 / api.scale(state);
    selection.setAttribute("transform", api.transform(item, state));
    selection.innerHTML = `<rect class="selection" x="${x - pad}" y="${y - pad}" width="${w + 2 * pad}" height="${h + 2 * pad}" />`;
  }

  function drawLayers() {
    $("layer-count").textContent = state.objects.length;
    $("layers").innerHTML = [...state.objects].reverse().map((item) =>
      `<button data-layer="${item.id}" class="layer" aria-pressed="${item.id === selected}">${thumb(item.key, item.mono)}
       <span>${api.xml(api.object(item.key, state).name)}</span>${item.mono ? "<small>фон</small>" : ""}</button>`).join("")
      || '<p class="layer-note">Добавьте объект или соберите композицию.</p>';
  }

  function drawInspector() {
    const index = state.objects.findIndex((x) => x.id === selected);
    const item = state.objects[index];
    $("inspector").hidden = !item;
    if (!item) return;
    for (const key of ["x", "y", "angle"]) $(key).value = Math.round(item[key]);
    $("mono").disabled = !lib.objects[item.key];
    $("mono").checked = item.mono;
    $("up").disabled = index === state.objects.length - 1;
    $("down").disabled = index === 0;
  }

  function redraw() {
    drawAssets();
    drawPalettes();
    drawCanvas();
    drawLayers();
    drawInspector();
    persist();
  }

  function assemble(libraryState = state) {
    const query = state.query.trim();
    if (!query) {
      status("Введите заголовок или названия объектов.");
      $("query").focus();
      return;
    }
    const { keys, missing } = api.resolve(query, state.mode, libraryState);
    if (!keys.length) {
      status("Подходящих объектов нет. Попробуйте другие слова или выберите объект в библиотеке.");
      return;
    }
    state.objects = api.compose(keys, state, state.mode);
    selected = null;
    redraw();
    status(missing.length ? `Пропущено: ${missing.join(", ")}` : `Объектов в композиции: ${keys.length}`);
  }

  const drawExamples = () => {
    $("examples").innerHTML = demos.map((demo, i) => `<button data-demo="${i}">${demo.label}</button>`).join("");
  };
  $("examples").addEventListener("click", (event) => {
    const button = event.target.closest("[data-demo]");
    if (!button) return;
    const { label, ...demo } = demos[Number(button.dataset.demo)];
    Object.assign(state, demo, { custom: null });
    tools();
    assemble({ ...state, imports: undefined });
  });

  document.querySelector(".tabs").addEventListener("click", (event) => {
    const mode = event.target.closest("[data-mode]")?.dataset.mode;
    if (!mode || mode === state.mode) return;
    state.mode = mode;
    state.query = "";
    tools();
    persist();
    $("query").focus();
  });
  $("query").addEventListener("input", (event) => {
    state.query = event.target.value;
    persist();
  });
  $("query").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) assemble();
  });
  $("compose").addEventListener("click", () => assemble());
  $("search").addEventListener("input", drawAssets);
  $("palette-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-palette]");
    if (!button) return;
    const key = button.dataset.palette;
    state.custom = key === "custom" ? state.customColors : null;
    if (key !== "custom") state.palette = Number(key);
    redraw();
  });
  for (const key of ["format", "size", "layout"]) $(key).addEventListener("change", (event) => {
    const value = event.target.value;
    if (key === "format") {
      const [oldW, oldH] = api.formats[state.format];
      const [newW, newH] = api.formats[value];
      for (const layer of state.objects) {
        layer.x = layer.x * newW / oldW;
        layer.y = layer.y * newH / oldH;
      }
    }
    state[key] = value;
    if (key === "layout" && state.objects.length) {
      const order = [...state.objects].sort((a, b) => Number(a.mono) - Number(b.mono));
      const arranged = api.compose(order.map((item) => item.key), state, "objects");
      arranged.forEach((position, index) => Object.assign(order[index], { x: position.x, y: position.y }));
    }
    redraw();
  });

  $("assets").addEventListener("click", (event) => {
    const key = event.target.closest("[data-key]")?.dataset.key;
    if (!key) return;
    const [w, h] = api.formats[state.format];
    const shift = state.objects.length % 4 * 18;
    const item = { id: api.id(), key, x: w / 2 + shift, y: h / 2 + shift, angle: 0, mono: false };
    state.objects.push(item);
    selected = item.id;
    redraw();
  });
  $("layers").addEventListener("click", (event) => {
    const button = event.target.closest("[data-layer]");
    if (button) select(button.dataset.layer);
  });

  const current = () => state.objects.find((item) => item.id === selected);
  for (const key of ["x", "y", "angle"]) $(key).addEventListener("change", (event) => {
    const item = current();
    const n = event.target.valueAsNumber;
    if (!item || !Number.isFinite(n)) { drawInspector(); return; }
    item[key] = key === "angle" ? n % 360 : Math.max(-10000, Math.min(10000, n));
    drawCanvas();
    drawInspector();
    persist();
  });
  $("mono").addEventListener("change", (event) => {
    const item = current();
    if (!item || !lib.objects[item.key]) return;
    item.mono = event.target.checked;
    redraw();
  });
  function moveLayer(delta) {
    const index = state.objects.findIndex((item) => item.id === selected);
    const to = index + delta;
    if (index === -1 || to < 0 || to >= state.objects.length) return;
    const [item] = state.objects.splice(index, 1);
    state.objects.splice(to, 0, item);
    redraw();
  }
  function duplicate() {
    const item = current();
    if (!item) return;
    const copy = { ...item, id: api.id(), x: item.x + 22, y: item.y + 22 };
    state.objects.splice(state.objects.indexOf(item) + 1, 0, copy);
    selected = copy.id;
    redraw();
  }
  function remove() {
    const index = state.objects.findIndex((item) => item.id === selected);
    if (index === -1) return;
    state.objects.splice(index, 1);
    selected = state.objects[Math.min(index, state.objects.length - 1)]?.id;
    redraw();
  }
  $("up").addEventListener("click", () => moveLayer(1));
  $("down").addEventListener("click", () => moveLayer(-1));
  $("duplicate").addEventListener("click", duplicate);
  $("remove").addEventListener("click", remove);
  $("clear").addEventListener("click", () => {
    state.objects = [];
    selected = null;
    status("");
    redraw();
  });
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input,textarea,select,button:not(.layer)") || !current()) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove();
    }
    if (event.key === "Escape") select(null);
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (direction) {
      event.preventDefault();
      const item = current();
      item.x += direction[0] * (event.shiftKey ? 10 : 1);
      item.y += direction[1] * (event.shiftKey ? 10 : 1);
      drawCanvas();
      drawInspector();
      persist();
    }
  });

  function pointer(event) {
    const matrix = canvas.getScreenCTM();
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    const element = event.target.closest(".scene-item");
    select(element?.dataset.layer || null);
    if (!element) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const item = current();
    const p = pointer(event);
    drag = { id: event.pointerId, element, item, dx: item.x - p.x, dy: item.y - p.y };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    const p = pointer(event);
    drag.item.x = Math.round(p.x + drag.dx);
    drag.item.y = Math.round(p.y + drag.dy);
    drag.element.setAttribute("transform", api.transform(drag.item, state));
    drawInspector();
    drawSelection();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(event, () => {
    if (drag) persist();
    drag = null;
  });

  $("export").addEventListener("click", () => {
    const title = state.query.trim() || "Композиция";
    const url = URL.createObjectURL(new Blob([api.svg(state, title)], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = (title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 48) || "composition") + ".svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("SVG подготовлен к скачиванию.");
  });

  function parsePalette(text) {
    const source = text.trim();
    if (/^[\[{]/.test(source)) return api.importPalette(JSON.parse(source));
    const hex = source.match(/#[\da-f]{6}\b|#[\da-f]{3}\b/gi);
    if (hex) return api.importPalette(hex);
    const rgb = source.split("\n").map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\b/))
      .filter(Boolean).map((row) => row.slice(1, 4).map(Number));
    const colors = rgb.map((channels) => "#" + channels.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join(""));
    return api.importPalette(colors);
  }
  $("palette-file").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      if (file.size > 64000) throw Error("Файл палитры слишком большой.");
      state.custom = state.customColors = parsePalette(await file.text());
      redraw();
      status("Палитра применена.");
    } catch (error) {
      status(error instanceof SyntaxError ? "Не удалось прочитать JSON палитры." : error.message);
    } finally {
      event.target.value = "";
    }
  });

  const shapes = new Set(["g", "path", "rect", "circle", "ellipse", "line", "polygon", "polyline", "defs", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "svg", "use", "symbol"]);
  const attributes = new Set("id href x y x1 y1 x2 y2 width height cx cy r rx ry fx fy fr d points translate transform viewBox preserveAspectRatio fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity clip-rule clip-path clipPathUnits mask maskUnits maskContentUnits gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity overflow".split(" "));
  function readSvg(source) {
    const root = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
    if (root.localName !== "svg" || root.namespaceURI !== "http://www.w3.org/2000/svg") throw Error("Файл не является SVG.");
    const box = root.getAttribute("viewBox")?.trim().split(/[ ,]+/).map(Number) ||
      [0, 0, ...["width", "height"].map((name) => Number(root.getAttribute(name)?.replace(/px$/, "")))];
    if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw Error("В SVG нужен корректный viewBox либо ширина и высота.");
    const bad = [...root.querySelectorAll("*")].find((element) =>
      !shapes.has(element.localName) && !["title", "desc", "metadata"].includes(element.localName));
    if (bad) throw Error(`Элемент <${bad.localName}> не поддерживается. Импортируйте SVG с векторными контурами.`);
    const name = root.querySelector("title")?.textContent.trim();
    let visible = 0;
    function clean(node, prefix, isRoot = false) {
      if (!shapes.has(node.localName) || node.namespaceURI !== root.namespaceURI) return "";
      if (["path", "rect", "circle", "ellipse", "line", "polygon", "polyline", "use"].includes(node.localName)) visible++;
      const safe = [...node.attributes].flatMap((attr) => {
        const k = attr.localName;
        let val = attr.value;
        if ((isRoot && ["x", "y", "width", "height", "viewBox", "preserveAspectRatio", "overflow"].includes(k)) || !attributes.has(k) || (attr.namespaceURI && attr.namespaceURI !== "http://www.w3.org/1999/xlink")) return [];
        if (k === "id") val = prefix + val;
        if (k === "href") {
          if (!/^#[\w:.-]+$/.test(val)) return [];
          val = "#" + prefix + val.slice(1);
        }
        if (/url\s*\(/i.test(val)) {
          const local = val.match(/^url\(\s*#([\w:.-]+)\s*\)$/);
          if (!local) return [];
          val = `url(#${prefix}${local[1]})`;
        } else if (["fill", "stroke", "stop-color"].includes(k) &&
                   !/^(?:#[a-f\d]{3,8}|[a-z]+|rgba?\([\d., %]+\)|hsla?\([\d., %]+\))$/i.test(val.trim())) {
          return [];
        }
        return [` ${k}="${api.xml(val)}"`];
      }).join("");
      const element = isRoot ? "g" : node.localName;
      return `<${element}${safe}>${[...node.children].map((child) => clean(child, prefix)).join("")}</${element}>`;
    }
    const prefix = "svgref-";
    const markup = clean(root, prefix, true);
    if (!visible) throw Error("В SVG нет векторных контуров.");
    const body = `<g fill="#181817">${markup}</g>`;
    const normalized = [935, 467].map((width) => {
      const factor = width / Math.max(box[2], box[3]);
      return { box: box.map((n) => n * factor), body: `<g transform="scale(${factor})">${body}</g>` };
    });
    return { name, variants: { L: [normalized[0], normalized[0]], S: [normalized[1], normalized[1]] } };
  }

  $("svg-files").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    const errors = [];
    let imported = 0;
    for (const file of files) {
      try {
        if (file.size > 2_000_000) throw Error("SVG превышает 2 МБ.");
        const data = readSvg(await file.text());
        const key = "import-" + api.id();
        data.name ||= file.name.replace(/\.svg$/i, "");
        data.terms = data.name;
        state.imports ||= {};
        state.imports[key] = data;
        imported++;
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`);
      }
    }
    event.target.value = "";
    redraw();
    status([imported ? `Добавлено SVG: ${imported}` : "", ...errors].filter(Boolean).join(" · "));
  });

  if (!state.mode) state.mode = "phrase";
  if (typeof state.query !== "string") state.query = "";
  tools();
  drawExamples();
  const demoIndex = new URLSearchParams(location.search).get("demo");
  const demoButton = demoIndex != null && /^[012]$/.test(demoIndex)
    ? $("examples").querySelector(`[data-demo="${demoIndex}"]`) : null;
  if (demoButton) demoButton.click();
  else redraw();
})();
