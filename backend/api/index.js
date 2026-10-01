// Vercel entry point: every path is rewritten here (vercel.json) and handled
// by the Express app.

import { assertConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

assertConfig();

export default createApp();
