import { Worker } from 'bullmq';
import redis from '../config/redis';
import prisma from '../utils/prisma';
import axios from 'axios';
import * as tls from 'tls';
import { URL } from 'url';

export class UptimeMonitorWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('uptimeMonitor', this.processJob.bind(this), {
      connection: redis,
      concurrency: 10, // Processar múltiplos sites simultaneamente
    });

    this.worker.on('completed', (job) => {
      console.log(`Uptime check for job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Uptime check job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (error) => {
      console.error('Uptime monitor worker error:', error);
    });
  }

  private async processJob(job: any) {
    const { websiteId, url } = job.data;
    
    console.log(`Checking uptime for website: ${url}`);

    try {
      const website = await prisma.website.findUnique({
        where: { id: websiteId, isActive: true }
      });

      if (!website) {
        console.log(`Website ${websiteId} not found or inactive, skipping uptime check`);
        return;
      }

      const uptimeResult = await this.checkWebsiteUptime(url);
      
      await prisma.uptimeMetric.create({
        data: {
          websiteId,
          isUp: uptimeResult.isUp,
          responseTime: uptimeResult.responseTime,
          statusCode: uptimeResult.statusCode,
          errorMessage: uptimeResult.errorMessage,
          measuredAt: new Date()
        }
      });

      console.log(`Uptime check saved for ${url}: ${uptimeResult.isUp ? 'UP' : 'DOWN'} (${uptimeResult.responseTime}ms)`);

      const lastMetric = await prisma.uptimeMetric.findFirst({
        where: { 
          websiteId,
          measuredAt: { lt: new Date() }
        },
        orderBy: { measuredAt: 'desc' }
      });

      if (!lastMetric || lastMetric.isUp !== uptimeResult.isUp) {
        const statusChange = uptimeResult.isUp ? 'UP' : 'DOWN';
        console.log(`Status change detected for ${url}: ${statusChange}`);
      }

    } catch (error) {
      console.error(`Error in uptime check for ${url}:`, error);
      
      // Salvar erro como métrica DOWN
      await prisma.uptimeMetric.create({
        data: {
          websiteId,
          isUp: false,
          responseTime: null,
          statusCode: null,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          measuredAt: new Date()
        }
      });
    }
  }

  private async checkWebsiteUptime(url: string): Promise<{
    isUp: boolean;
    responseTime: number | null;
    statusCode: number | null;
    errorMessage: string | null;
    sslValid?: boolean;
  }> {
    const startTime = Date.now();
    
    try {
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      
      const response = await axios.get(normalizedUrl, {
        timeout: 15000, 
        headers: {
          'User-Agent': 'ATD-Monitor/1.0 (Uptime Monitor)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      const responseTime = Date.now() - startTime;
      let sslValid = undefined;

      if (normalizedUrl.startsWith('https://')) {
        try {
          sslValid = await this.checkSSL(normalizedUrl);
        } catch (sslError) {
          console.warn(`SSL check failed for ${url}:`, sslError);
          sslValid = false;
        }
      }

      return {
        isUp: true,
        responseTime,
        statusCode: response.status,
        errorMessage: null,
        sslValid
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      if (url.startsWith('https://')) {
        try {
          const httpUrl = url.replace('https://', 'http://');
          const httpResponse = await axios.get(httpUrl, {
            timeout: 15000,
            headers: {
              'User-Agent': 'ATD-Monitor/1.0 (Uptime Monitor)',
            },
            maxRedirects: 5,
            validateStatus: (status) => status < 500
          });

          const httpResponseTime = Date.now() - startTime;

          return {
            isUp: true,
            responseTime: httpResponseTime,
            statusCode: httpResponse.status,
            errorMessage: null,
            sslValid: false
          };

        } catch (httpError) {
          
        }
      }

      return {
        isUp: false,
        responseTime: responseTime > 15000 ? null : responseTime,
        statusCode: error.response?.status || null,
        errorMessage: this.getErrorMessage(error)
      };
    }
  }

  private async checkSSL(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const port = urlObj.port ? parseInt(urlObj.port) : 443;

        const socket = tls.connect({
          host: hostname,
          port: port,
          servername: hostname,
          timeout: 10000
        });

        socket.on('secureConnect', () => {
          const cert = socket.getPeerCertificate();
          const now = new Date();
          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          
          const isValid = socket.authorized && 
                          now >= validFrom && 
                          now <= validTo;
          
          socket.destroy();
          resolve(isValid);
        });

        socket.on('error', () => {
          socket.destroy();
          resolve(false);
        });

        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });

      } catch (error) {
        resolve(false);
      }
    });
  }

  private getErrorMessage(error: any): string {
    if (error.code) {
      switch (error.code) {
        case 'ECONNREFUSED': return 'Connection refused';
        case 'ENOTFOUND': return 'Domain not found';
        case 'ETIMEDOUT': return 'Connection timeout';
        case 'ECONNRESET': return 'Connection reset';
        case 'CERT_HAS_EXPIRED': return 'SSL certificate expired';
        case 'CERT_UNTRUSTED': return 'SSL certificate untrusted';
        default: return `Network error: ${error.code}`;
      }
    }
    
    if (error.response?.status) {
      return `HTTP ${error.response.status}: ${error.response.statusText || 'Server error'}`;
    }
    
    return error.message || 'Unknown error';
  }

  async close() {
    await this.worker.close();
  }
}

export const uptimeMonitorWorker = new UptimeMonitorWorker();