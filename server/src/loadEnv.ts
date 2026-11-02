import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// .env à la racine du projet (facultatif, serveur Node seulement). À importer en tout premier.
const envFile = resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
