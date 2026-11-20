const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("../library.js");
require("../engine.js");
const lib = globalThis.AtelierLibrary;
const api = globalThis.Atelier;
assert.equal(Object.keys(lib.objects).length, 10);
assert.equal(lib.palettes.length, 3);
for (const object of Object.values(lib.objects)) {
  for (const size of ["L", "S"]) {
    assert.equal(object.variants[size].length, 2);
    for (const asset of object.variants[size]) {
      assert(asset.box[2] > 0 && asset.box[3] > 0);
      assert.match(asset.body, /<path/);
      assert.doesNotMatch(asset.body, /<image|<script/);
    }
  }
}

const examples = [
  ["pieces", "Из частей в целое", "phrase", 0, "L", "wide", "cluster", ["book", "puzzle", "phone"]],
  ["headphones", "Тишина в наушниках", "phrase", 2, "S", "square", "offset", ["phone", "headphones", "flowers"]],
  ["desk", "Папка, ручка, монета", "objects", 1, "L", "tall", "title", ["folder", "pen", "coin"]],
];

for (const [file, phrase, mode, palette, size, format, layout, expected] of examples) {
  const state = { ...api.defaults, palette, size, format, layout };
  const { keys, missing } = api.resolve(phrase, mode, state);
  assert.deepEqual([...keys].sort(), [...expected].sort());
  assert.deepEqual(missing, []);
  state.objects = api.compose(keys, state, mode);
  const svg = api.svg(state, phrase);
  assert.equal((svg.match(/aria-label=/g) || []).length, 3);
  assert.match(svg, /clipPath/);
  assert.doesNotMatch(svg, /<image/);
  if (process.argv.includes("--examples")) {
    // Stable names keep repository diffs readable after regenerating examples.
    state.objects = state.objects.map((item, i) => ({ ...item, id: String(i + 1) }));
    fs.writeFileSync(path.join(__dirname, "..", "examples", file + ".svg"), api.svg(state, phrase));
  }
}

const state = { ...api.defaults };
assert.deepEqual(api.resolve("Монета, неизвестная штука, Монета", "objects", state),
  { keys: ["coin", "coin"], missing: ["неизвестная штука"] });
assert.deepEqual(api.resolve("абракадабра", "phrase", state).keys, []);
const colors = api.importPalette(require("../examples/palette.json"));
assert.equal(colors[1], "#F9E9B7");
assert.throws(() => api.importPalette(["invalid"]), /Нужны/);
const custom = { ...state, custom: colors };
custom.objects = api.compose(["puzzle"], custom, "objects");
assert.match(api.svg(custom, "<Пазлы>"), /&lt;Пазлы&gt;/);
assert.match(api.svg(custom, ""), /#EEE3D9.*|#F9E9B7/);
console.log("OK: original assets, both input modes, formats, palettes, grouped vector SVG.");
