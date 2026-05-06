import prisma from '../../utils/prisma';

interface WebsiteValidationResult {
  isValid: boolean;
  website?: {
    id: string;
    url: string;
    isActive: boolean;
  };
  error?: string;
}

export class WebsiteValidationByIdService {

  async validateWebsite(websiteId: string): Promise<WebsiteValidationResult> {
    try {
      const website = await prisma.website.findUnique({
        where: { id: websiteId },
        select: { id: true, url: true, isActive: true }
      });

      if (!website) {
        return {
          isValid: false,
          error: `Website not found: ${websiteId}`
        };
      }

      if (!website.isActive) {
        return {
          isValid: false,
          error: `Website is inactive: ${websiteId}`
        };
      }

      return {
        isValid: true,
        website
      };

    } catch (error) {
      return {
        isValid: false,
        error: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export const websiteValidationByIdService = new WebsiteValidationByIdService();