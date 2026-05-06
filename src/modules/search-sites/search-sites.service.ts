import prisma from '../../utils/prisma';
import { searchSitesQueue, dealerDiscoveryQueue, SearchSitesJobData } from '../../config/queue';
import { StartDealerDiscoveryRequest, StartSearchJobRequest } from './search-sites.schema';

export class SearchSitesService {
  async startSearchJobs(data: StartSearchJobRequest) {
    const { brandIds, stateIds } = data;

    const brands = await prisma.brand.findMany({
      where: brandIds ? { id: { in: brandIds } } : undefined,
      select: { id: true, name: true }
    });

    const states = await prisma.state.findMany({
      where: stateIds ? { id: { in: stateIds } } : undefined,
      select: { id: true, name: true }
    });

    if (brands.length === 0 || states.length === 0) {
      throw new Error('No brands or states found to process');
    }

    const jobsCreated = [];
    const totalCombinations = brands.length * states.length;

    console.log(`Starting search jobs for ${brands.length} brands x ${states.length} states = ${totalCombinations} combinations`);

    for (const brand of brands) {
      for (const state of states) {
        try {
          const existingJob = await prisma.searchJob.findUnique({
            where: {
              brandId_stateId: {
                brandId: brand.id,
                stateId: state.id
              }
            }
          });

          let searchJob;
          if (existingJob && existingJob.status === 'RUNNING') {
            console.log(`Job already running for ${brand.name} in ${state.name}`);
            continue;
          } else if (existingJob) {
            searchJob = await prisma.searchJob.update({
              where: { id: existingJob.id },
              data: {
                status: 'PENDING',
                totalFound: null,
                totalProcessed: null,
                errorMessage: null,
                startedAt: null,
                completedAt: null,
              }
            });
          } else {
            searchJob = await prisma.searchJob.create({
              data: {
                brandId: brand.id,
                stateId: state.id,
                status: 'PENDING',
              }
            });
          }

          const jobData: SearchSitesJobData = {
            brandId: brand.id,
            stateId: state.id,
            searchJobId: searchJob.id,
          };

          const queueJob = await searchSitesQueue.add(
            'searchSites',
            jobData,
            {
              jobId: `${brand.id}-${state.id}-${Date.now()}`,
              delay: Math.floor(Math.random() * 5000),
            }
          );

          jobsCreated.push({
            jobId: searchJob.id,
            queueJobId: queueJob.id,
            brandName: brand.name,
            stateName: state.name,
          });

        } catch (error) {
          console.error(`Error creating job for ${brand.name} in ${state.name}:`, error);
        }
      }
    }

    return {
      message: `${jobsCreated.length} search jobs started successfully. Monitor progress at /admin/queues`,
      totalCombinations,
      jobsCreated: jobsCreated.length,
    };
  }

  async startDealerDiscovery(data: StartDealerDiscoveryRequest) {
    const requestedSources = data.sources ?? ['cnae', 'brand_site'];
    const sources = [...new Set(requestedSources)];

    if (sources.includes('google_places') && !data.allowPaidSources) {
      throw new Error('google_places is disabled by default. Send allowPaidSources=true to enable the paid source explicitly.');
    }

    const brands = await prisma.brand.findMany({
      where: {
        ...(data.brandIds ? { id: { in: data.brandIds } } : {}),
        ...((data.onlyMissing ?? true) ? { stores: { none: {} } } : {}),
      },
      select: { id: true, name: true },
    });

    const states = await prisma.state.findMany({
      where: data.stateIds ? { id: { in: data.stateIds } } : undefined,
      select: { id: true, name: true },
    });

    if (!brands.length || !states.length) throw new Error('No brands or states found');

    let jobsCreated = 0;
    let jobsSkipped = 0;
    for (const brand of brands) {
      for (const state of states) {
        const jobId = `discovery-${brand.id}-${state.id}-${sources.slice().sort().join('-')}`;
        const existingQueueJob = await dealerDiscoveryQueue.getJob(jobId);

        if (existingQueueJob) {
          const existingState = await existingQueueJob.getState();
          if (['active', 'waiting', 'delayed', 'prioritized'].includes(existingState)) {
            jobsSkipped++;
            continue;
          }
        }

        await dealerDiscoveryQueue.add(
          'discoverDealers',
          { brandId: brand.id, stateId: state.id, sources },
          { jobId, delay: Math.floor(Math.random() * 3000) }
        );
        jobsCreated++;
      }
    }

    return {
      message: `${jobsCreated} discovery jobs started (${sources.join(', ')})`,
      jobsCreated,
      jobsSkipped,
      totalCombinations: brands.length * states.length,
      onlyMissing: data.onlyMissing ?? true,
      sources,
    };
  }
}
