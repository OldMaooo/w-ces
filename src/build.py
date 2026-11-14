from pathlib import Path
import base64,json
root=Path(__file__).resolve().parent.parent
html=(root/'src/editor.html').read_text()
libs='\n'.join('<script>\n'+(root/'src/vendor'/f).read_text()+'\n</script>' for f in ['three.js','orbit.js','transform.js','gltf-loader.js','skeleton-utils.js'])
icons={p.stem:p.read_text() for p in (root/'src/vendor/lucide').glob('*.svg')}
notices='<!-- Third-party licenses\n'+(root/'src/vendor/THREE-LICENSE').read_text()+'\n'+(root/'src/vendor/lucide/LICENSE').read_text()+'\nQuaternius Animated Men Pack: CC0 1.0 https://creativecommons.org/publicdomain/zero/1.0/ \n-->\n'
assets=notices+'<script id="humanAsset" type="application/octet-stream">'+base64.b64encode((root/'src/assets/animated-man.glb').read_bytes()).decode()+'</script>\n<script id="defaultPlans" type="application/json">'+json.dumps(json.loads((root/'doc/Files/CES-02.json').read_text()),ensure_ascii=False).replace('</','<\\/')+'</script>\n<script id="lucideAssets" type="application/json">'+json.dumps(icons)+'</script>'
modules='\n'.join((root/'src'/f).read_text() for f in ['icons.js','people.js','venue.js','tour-model.js','tour-path.js','tour-timeline.js','tour-plan.js','tour-player.js','app.js'])
html=html.replace('<!-- LIBRARIES -->',assets+'\n'+libs).replace('// APP',modules)
(root/'index.html').write_text(html)
print(f'Built index.html: {len(html):,} chars; all dependencies embedded')
