import dotenv from "dotenv";
dotenv.config();

const PORT = parseInt(`${process.env.PORT || 3000}`);

import api from "./api";

api.listen(PORT, '0.0.0.0', () => {
  console.log(`API rodando na porta: ${PORT}`);
  console.log(`Acesso local: http://localhost:${PORT}`);
  console.log(`Acesso na rede: http://[SEU_IP]:${PORT}`);
  console.log(`BullBoard disponível em: http://localhost:${PORT}/admin/queues`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});