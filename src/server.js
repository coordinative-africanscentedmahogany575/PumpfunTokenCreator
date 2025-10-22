const { startServer } = require('./gui/server');

const port = Number(process.env.PORT || 3000);
startServer({ port });

