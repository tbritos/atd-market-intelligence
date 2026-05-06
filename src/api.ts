import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { serverAdapter, bullBoardAuth } from "./config/bullboard";
import searchSitesRouter from "./modules/search-sites/search-sites.router";
import storesRouter from "./modules/stores/stores.router";
import websitesRouter from "./modules/websites/websites.router";
import brandsRouter from "./modules/brands/brands.router";
import dashboardRouter from "./modules/dashboard/dashboard.router";
import providersRouter from "./modules/providers/providers.router";
import importsRouter from "./modules/imports/imports.router";
import amostraLeadsRouter from "./modules/amostra-leads/amostra-leads.router";
import discoveryRouter from "./modules/discovery/discovery.router";
import storeEnrichmentRouter from "./modules/store-enrichment/store-enrichment.router";
import webhooksRouter from "./modules/webhooks/webhooks.router";
import dealerGroupsRouter from "./modules/dealer-groups/dealer-groups.router";

declare global {
  namespace Express {
    interface Request {
      user?: any;
      groups?: any;
    }
  }
}

const api = express();

api.use(morgan("tiny"));
api.use(cors({
  origin: true, // Permite qualquer origem
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));
api.use(helmet());
api.use(express.json({ limit: '10mb' }));
api.use(cookieParser());

api.use('/admin/queues', bullBoardAuth, serverAdapter.getRouter());

// API Routes
api.use("/search-sites", searchSitesRouter);
api.use("/stores", storesRouter);
api.use("/websites", websitesRouter);
api.use("/brands", brandsRouter);
api.use("/dashboard", dashboardRouter);
api.use("/providers", providersRouter);
api.use("/imports", importsRouter);
api.use("/amostra-leads", amostraLeadsRouter);
api.use("/discovery", discoveryRouter);
api.use("/store-enrichment", storeEnrichmentRouter);
api.use("/webhooks", webhooksRouter);
api.use("/dealer-groups", dealerGroupsRouter);

api.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof Error) {
    res.status(500).send(error.message);
  }
});

api.get("/health", (_, res) => {
  res.status(200).json({ status: "UP", timestamp: new Date() });
});

export default api;