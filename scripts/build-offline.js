// Junta tudo num só HTML (a versão offline publicada como página).
const fs = require('fs'), path = require('path');
const r = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
let html = r('client', 'index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="engine.js">'));
const fonts = (html.match(/<link rel="(?:preconnect|stylesheet)" href="https:[^>]+>/g) || []).join('\n');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const out = `<title>Cassino da Madeira</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>
${r('client', 'styles.css')}
</style>
${body}
<script>
${safe(r('shared', 'engine.js'))}
${safe(r('shared', 'bots.js'))}
${safe(r('client', 'rules.js'))}
${safe(r('client', 'app.js'))}
</script>
`;
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'cassino-offline.html'), out);
console.log('dist/cassino-offline.html', out.length, 'bytes');
