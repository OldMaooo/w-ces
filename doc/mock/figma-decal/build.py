# 生成草样：把 mock.css / mock.js 注入已构建的编辑器（先跑 python3 src/build.py）
from pathlib import Path
here=Path(__file__).resolve().parent;root=here.parent.parent.parent
import time;v=str(int(time.time()))
html=(root/'index.html').read_text()
html=html.replace('</head>','<link rel="stylesheet" href="mock.css?v='+v+'"></head>',1).replace('</body>','<script src="mock.js?v='+v+'"></script></body>')
(here/'index.html').write_text(html);print('mock built')
