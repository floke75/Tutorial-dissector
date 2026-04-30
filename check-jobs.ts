import { getJobState } from './server/jobManager.ts';
import fs from 'fs';

// Since the dev server is running its own instance, we can't easily access its memory from a separate script.
// Wait, we need an API endpoint to list jobs.
