// Local / long-running server: `npm run dev` or `npm start`.

import { assertConfig, config } from './config.js';
import { createApp } from './app.js';

assertConfig();
createApp().listen(config.port, () => {
  console.log(`Aptric API on http://localhost:${config.port}`);
});
