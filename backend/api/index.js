// Vercel entry point: every path is rewritten here (vercel.json) and handled
// by the Express app.
//
// A missing or invalid environment variable must not crash the function at
// import time (Vercel then answers every request with a bare
// 500 FUNCTION_INVOCATION_FAILED and no CORS headers). Instead the app starts
// in a degraded mode that answers with a JSON error naming the problem.

import { configProblems } from '../src/config.js';
import { createApp, createMisconfiguredApp } from '../src/app.js';

const problems = configProblems();
if (problems.length) console.error('[config]', problems.join('; '));

export default problems.length ? createMisconfiguredApp(problems) : createApp();
