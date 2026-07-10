// Server entry point
require('dotenv').config();

const app = require('./src/app');
const { initDatabase } = require('./src/config/db');

const PORT = process.env.PORT || 3000;

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('DB initialization failed:', error.message);
    process.exit(1);
  });
