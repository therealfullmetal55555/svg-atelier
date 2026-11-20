"""Extract individual editable SVG assets from the two Figma section exports."""
import json
import re
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.svgLib.path import parse_path

NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
ROOT = Path(__file__).resolve().parents[1]
OBJECTS = [
    ("book", "Книга", "книг чтение роман учебник библиотека обучение знания рассказ", 12, 13, 10, 19),
    ("phone", "Телефон", "телефон смартфон экран приложение связь мобильн цифров онлайн", 14, 15, 11, 20),
    ("puzzle", "Пазлы", "пазл част кусоч сложить соедин детал сборк команда решение целое", 5, 6, 12, 21),
    ("coin", "Монета", "монет деньг финанс стоимост оплат цен бюджет инвестици накоп", 26, 27, 13, 22),
    ("headphones", "Наушники", "наушник музык звук подкаст трек плейлист слуш аудио мелоди тишин", 16, 17, 14, 23),
    ("lamp", "Лампа", "ламп свет иде мысл фокус озарени ночь рабоч", 18, 19, 15, 24),
    ("flowers", "Цветы", "цвет ваз растен рост природ уют весн красот", 36, 37, 2, 3),
    ("folder", "Папка", "папк документ файл архив поряд организ загруз договор", 24, 25, 16, 25),
    ("pen", "Ручка", "ручк перо карандаш пис заметк черновик рисован подпись план текст", 22, 23, 17, 26),
    ("wallet", "Кошелёк", "кошел бумажник карт деньг покупк финанс расход накоп оплат бюджет", 20, 21, 18, 27),
]

def tag(node):
    return node.tag.rsplit("}", 1)[-1]

def bounds(node, offset=(0, 0)):
    # Figma uses translations for the background tiles in these exports.
    transform = node.get("transform", "")
    if transform:
        match = re.fullmatch(r"translate\(([-\d.]+)[ ,]+([-\d.]+)\)", transform)
        if not match:
            raise ValueError(f"Unsupported transform: {transform}")
        offset = tuple(a + b for a, b in zip(offset, map(float, match.groups())))
    dx, dy = offset
    kind = tag(node)
    if kind == "path":
        pen = BoundsPen(None)
        parse_path(node.get("d"), pen)
        x1, y1, x2, y2 = pen.bounds
    elif kind == "rect":
        x1, y1 = (float(node.get(k, 0)) for k in ("x", "y"))
        x2, y2 = x1 + float(node.get("width")), y1 + float(node.get("height"))
    elif kind == "line":
        x1, x2 = sorted(float(node.get(k, 0)) for k in ("x1", "x2"))
        y1, y2 = sorted(float(node.get(k, 0)) for k in ("y1", "y2"))
    else:
        boxes = [bounds(child, offset) for child in node]
        return (min(b[0] for b in boxes), min(b[1] for b in boxes),
                max(b[2] for b in boxes), max(b[3] for b in boxes))
    stroke = float(node.get("stroke-width", 1)) / 2 if node.get("stroke") else 0
    return x1 + dx - stroke, y1 + dy - stroke, x2 + dx + stroke, y2 + dy + stroke

def make_asset(node, background=False):
    x1, y1, x2, y2 = bounds(node)
    if background:
        # Decorated lines extend slightly past the background tile in Figma.
        tile = next(child for child in node if tag(child) == "rect")
        x1, y1, x2, y2 = bounds(tile)
    for item in node.iter():
        item.attrib.pop("id", None)
    body = ET.tostring(node, encoding="unicode").replace(f' xmlns="{NS}"', "", 1)
    box = [round(n, 3) for n in (x1, y1, x2 - x1, y2 - y1)]
    return {"box": box, "body": body}

def main():
    paths = [ET.parse(p).getroot()[0] for p in sys.argv[1:]]
    if len(paths) != 2:
        raise SystemExit('Usage: python3 scripts/extract.py "Размер L.svg" "Размер S.svg"')
    large, small = paths
    objects = {}
    for key, name, terms, l, lf, s, sf in OBJECTS:
        objects[key] = {
            "name": name, "terms": terms,
            "variants": {
                "L": [make_asset(large[l]), make_asset(large[lf])],
                "S": [make_asset(small[s]), make_asset(small[sf])],
            }
        }
    palettes = [[element.get("fill") for element in large[i]] for i in (7, 8, 9)]
    backgrounds = {
        "L": [make_asset(large[i], True) for i in (2, 4, 3)],
        "S": [make_asset(small[i], True) for i in (4, 6, 5)],
    }
    data = {"objects": objects, "palettes": palettes, "backgrounds": backgrounds}
    (ROOT / "library.js").write_text(
        "// Original Figma SVG paths, extracted by scripts/extract.py.\n"
        "globalThis.AtelierLibrary = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )

if __name__ == "__main__":
    main()
