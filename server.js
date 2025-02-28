const app = require('./app');  // Import the configured Express app
require('dotenv').config({ path: 'config/.env' });

const server = app.listen(process.env.PORT, () => {
  console.log(`Server is running on: ${process.env.PORT}`);
});

server.keepAliveTimeout = 3000;

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.log(`Shutting down the server for ${err.message}`);
  console.log(`Shutting down the server for unhandled promise rejection`);

  server.close(() => {
    process.exit(1);
  });
});