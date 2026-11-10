// Arranque antigo, mantido para o caso de o Render ainda usar "node server/server.js".
// O servidor está em core/server/server.js.
const { server } = require('../core/server/server.js');
const PORT = +process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Plataforma a correr em http://localhost:${PORT}`));
