import 'dotenv/config';
import axios from 'axios';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = process.argv[2] || 'compass~crawler-google-places';

async function listRuns(limit = 100) {
  const { data } = await axios.get(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs`,
    { params: { token: APIFY_TOKEN, limit, desc: true }, timeout: 15000 }
  );
  return data.data.items as Array<{ id: string; status: string; usageTotalUsd?: number }>;
}

async function abortRun(runId: string) {
  await axios.post(
    `https://api.apify.com/v2/actor-runs/${runId}/abort`,
    undefined,
    { params: { token: APIFY_TOKEN }, timeout: 10000 }
  );
}

async function main() {
  if (!APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN not configured');
  }

  console.log(`Checking recent runs for actor ${ACTOR_ID}...`);
  const runs = await listRuns(100);
  const activeRuns = runs.filter((run) => ['RUNNING', 'READY', 'RUNNING-ABORTING'].includes(run.status));

  if (activeRuns.length === 0) {
    console.log('No active runs found.');
    return;
  }

  console.log(`Found ${activeRuns.length} active run(s). Aborting...`);
  for (const run of activeRuns) {
    try {
      await abortRun(run.id);
      console.log(`Aborted ${run.id} (${run.status})`);
    } catch (error: any) {
      console.error(`Failed to abort ${run.id}:`, error.response?.data?.error?.message ?? error.message);
    }
  }
}

main().catch((error) => {
  console.error('Abort Apify runs failed:', error.response?.data?.error?.message ?? error.message);
  process.exit(1);
});
