import dotenv from 'dotenv';
dotenv.config();

import PagespeedScript from './pagespeedScript';

async function runPagespeedScript() {
  console.log('🚀 Starting PageSpeed script...');
  
  try {
    const script = new PagespeedScript();
    await script.run();
    console.log('✅ PageSpeed script completed successfully');
  } catch (error) {
    console.error('❌ PageSpeed script failed:', error);
    process.exit(1);
  } finally {
    console.log('🔄 Closing connections...');
    process.exit(0);
  }
}

runPagespeedScript();