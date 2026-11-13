const lucideIcons=JSON.parse(document.getElementById('lucideAssets').textContent);
function icon(name){const template=document.createElement('template');template.innerHTML=lucideIcons[name];const svg=template.content.querySelector('svg');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');return svg;}
