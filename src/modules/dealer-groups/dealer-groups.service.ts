import { PrismaClient } from '@prisma/client';
import prismaClient from '../../utils/prisma';

const prisma = prismaClient as any;

export class DealerGroupsService {
  async list(params: {
    page?: number;
    limit?: number;
    search?: string;
    brandId?: string;
    crmStatus?: string;
    readyForSdr?: boolean;
  }) {
    const { page = 1, limit = 20, search, brandId, crmStatus, readyForSdr } = params;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { crmOrgName: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
        { apolloOrgName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (brandId) {
      where.brandId = brandId;
    }

    if (crmStatus) {
      where.crmStatus = crmStatus;
    }

    if (readyForSdr !== undefined) {
      where.readyForSdr = readyForSdr;
    }

    const [data, total] = await Promise.all([
      prisma.dealerGroup.findMany({
        where,
        include: {
          brand: { select: { name: true, slug: true } },
          _count: { select: { stores: true, contacts: true } }
        },
        orderBy: { priorityScore: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dealerGroup.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string) {
    return prisma.dealerGroup.findUnique({
      where: { id },
      include: {
        brand: { select: { name: true, slug: true } },
        stores: {
          include: {
            city: { select: { name: true } },
            state: { select: { code: true } },
            website: {
              select: {
                id: true,
                url: true,
                isActive: true,
                avgPerformanceScore: true,
                seoScore: true
              }
            }
          }
        },
        contacts: {
          orderBy: { isDecisionMaker: 'desc' }
        }
      },
    });
  }

  async getStats() {
    const [total, clientes, priorityA, readyForSdr] = await Promise.all([
      prisma.dealerGroup.count(),
      prisma.dealerGroup.count({ where: { crmStatus: 'CLIENTE' } }),
      prisma.dealerGroup.count({ where: { priorityScore: { gte: 80 } } }),
      prisma.dealerGroup.count({ where: { readyForSdr: true } }),
    ]);

    return { total, clientes, priorityA, readyForSdr };
  }
}
