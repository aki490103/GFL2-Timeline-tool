# 画像ソース

`ogp.svg` は OGP画像 (`tool/public/ogp.png`) の元データ。

1200x1200 で作図し、中央の 1200x630 を切り出す構成になっている
（macOS の qlmanage が SVG を正方形にフィットさせるため）。

再生成:

```sh
cd tool
qlmanage -t -s 1200 -o /tmp/ogpout design/ogp.svg
sips --cropToHeightWidth 630 1200 /tmp/ogpout/ogp.svg.png --out public/ogp.png
```
