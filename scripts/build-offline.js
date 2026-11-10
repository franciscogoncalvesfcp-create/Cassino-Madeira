// Junta tudo num só HTML: a versão offline, publicada como página, com todos os jogos contra bots.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = require('../core/client/files.js');
const r = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = r('core/client/index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<!--SCRIPTS-->'));
const fonts = (html.match(/<link rel="(?:preconnect|stylesheet)" href="https:[^>]+>/g) || []).join('\n');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const out = `<title>Cassino da Madeira</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>
${FILES.styles.map(r).join('\n')}
</style>
${body}
<script>
${FILES.scripts.map(f => safe(r(f))).join('\n')}
</script>
`;
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'cassino-offline.html'), out);
console.log('dist/cassino-offline.html', out.length, 'bytes');
