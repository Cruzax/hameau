import { runVillage } from '../test/runVillage';
import { metrics } from './metrics';

// npm run longrun -w server -- 120  →  indicateurs d'un run de 120 jours en mode gratuit.
const days = Number(process.argv[2] ?? 100);
const { sim, events } = await runVillage({ days });
console.log(JSON.stringify(metrics(events, sim.world), null, 2));
process.exit(0);
