import prisma from '../../utils/prisma';
import { ListProvidersRequest, CreateProviderRequest, UpdateProviderRequest } from './providers.schema';

export class ProvidersService {
  async listProviders(query: ListProvidersRequest) {
    const { page = 1, limit = 50, search, sortBy = 'name', sortOrder = 'asc' } = query;

    const validatedLimit = Math.min(limit, 1000);
    const offset = (page - 1) * validatedLimit;

    // Mapear campos de ordenação para os nomes corretos no banco
    const sortFieldMap = {
      name: 'name',
      avgPerformanceScore: 'avgPerformanceScore',
      avgSeoScore: 'avgSeoScore',
      avgDowntimeSeconds: 'avgDowntimeSeconds',
    };

    const orderBy = sortBy in sortFieldMap 
      ? { [sortFieldMap[sortBy as keyof typeof sortFieldMap]]: sortOrder }
      : { name: 'asc' as const };

    // Construir filtros de busca
    const whereConditions: any = {};
    
    if (search) {
      whereConditions.name = {
        contains: search,
        mode: 'insensitive'
      };
    }

    const [providers, total] = await Promise.all([
      prisma.websiteProvider.findMany({
        where: whereConditions,
        include: {
          _count: {
            select: {
              websites: true
            }
          }
        },
        orderBy,
        take: validatedLimit,
        skip: offset,
      }),
      prisma.websiteProvider.count({
        where: whereConditions,
      }),
    ]);

    const totalPages = Math.ceil(total / validatedLimit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data: providers,
      meta: {
        total,
        page,
        limit: validatedLimit,
        totalPages,
        hasNext,
        hasPrev,
        sortBy,
        sortOrder,
      },
    };
  }

  async createProvider(data: CreateProviderRequest) {
    const existingWithName = await prisma.websiteProvider.findUnique({
      where: { name: data.name }
    });
    
    if (existingWithName) {
      throw new Error('Provider name already exists');
    }

    const existingWithSlug = await prisma.websiteProvider.findUnique({
      where: { slug: data.slug }
    });
    
    if (existingWithSlug) {
      throw new Error('Provider slug already exists');
    }

    const newProvider = await prisma.websiteProvider.create({
      data: {
        name: data.name,
        slug: data.slug,
      },
      include: {
        _count: {
          select: {
            websites: true
          }
        }
      }
    });

    return newProvider;
  }

  async updateProvider(id: string, data: UpdateProviderRequest) {
    const existingProvider = await prisma.websiteProvider.findUnique({
      where: { id }
    });

    if (!existingProvider) {
      throw new Error('Provider not found');
    }

    if (data.name && data.name !== existingProvider.name) {
      const existingWithName = await prisma.websiteProvider.findUnique({
        where: { name: data.name }
      });
      
      if (existingWithName) {
        throw new Error('Provider name already exists');
      }
    }

    if (data.slug && data.slug !== existingProvider.slug) {
      const existingWithSlug = await prisma.websiteProvider.findUnique({
        where: { slug: data.slug }
      });
      
      if (existingWithSlug) {
        throw new Error('Provider slug already exists');
      }
    }

    const updatedProvider = await prisma.websiteProvider.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.slug && { slug: data.slug }),
        updatedAt: new Date(),
      },
      include: {
        _count: {
          select: {
            websites: true
          }
        }
      }
    });

    return updatedProvider;
  }
}