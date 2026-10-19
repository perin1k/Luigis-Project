import objApp from './app.js';

const intPort = Number(process.env.PORT ?? 3000);
const strHost = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(intPort) || intPort < 1 || intPort > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535.');
}
const objServer = objApp.listen(intPort, strHost, () => {
  console.log(`Luigi's Pizza: http://${strHost}:${intPort}`);
});
objServer.on('error', (objError) => {
  console.error(`Unable to start server: ${objError.code}`);
  process.exitCode = 1;
});
