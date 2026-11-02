import { LONGRUN_FOUNDERS } from '../test/longrunFounders';
import { runVillage } from '../test/runVillage';
import { metrics } from './metrics';
import { writeFileSync } from 'node:fs';

// npm run longrun -w server -- 110 [journal.json]  →  indicateurs d'un run à partir des 4 fondateurs de réglage.
const days = Number(process.argv[2] ?? 110);
const { sim, events } = await runVillage({ days, founders: LONGRUN_FOUNDERS });
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(events));
console.log(JSON.stringify(metrics(events, sim.world), null, 2));
process.exit(0);
