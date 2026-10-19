# Noto Sans SC PDF font assets

Source: https://github.com/google/fonts/tree/main/ofl/notosanssc
Upstream Git blob: `fb0637bafbcd804fe32152370a1225990745b4bc`
Upstream variable font SHA-256: `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`

License: SIL Open Font License 1.1, bundled in OFL.txt. Copyright and reserved font names are retained.

These static instances were generated from the upstream variable font with fontTools 4.62.1,
without glyph subsetting, at wght=400 (Regular) and wght=700 (Bold). Timestamps are preserved.
Both files are loaded on PDF export only; combined uncompressed size is approximately 20.2 MiB.
PDF generation subsets embedded glyphs. Italic requests use the corresponding upright weight.

Reproduction:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
for weight, name in [(400, 'Regular'), (700, 'Bold')]:
    font = TTFont('NotoSansSC[wght].ttf', recalcTimestamp=False)
    instantiateVariableFont(font, {'wght': weight}, inplace=True, updateFontNames=True)
    font.save(f'NotoSansSC-{name}.ttf')
```

Derived file SHA-256:

- NotoSansSC-Bold.ttf: `a8d8569e6cf8e93e830736e64c69568c5499ff65bf6a8ff860f0cdacc3eab7d0`
- NotoSansSC-Regular.ttf: `eeb06b8a64fd04a2744d95579db1571b51027cda61ed78c62e4b730791525461`
