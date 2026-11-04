// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * En desarrollo no reimplementamos el endpoint: se llama al mismo handler que
 * usa Netlify, así dev y producción se comportan igual.
 */
function endpointConfirmacion() {
  return {
    name: 'confirmation-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/send-confirmation', async (req, res) => {
        const enviar = (status, cuerpo) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(cuerpo);
        };

        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);

          const headers = {};
          if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
          if (req.headers.authorization) headers.authorization = req.headers.authorization;
          if (req.headers.origin) headers.origin = req.headers.origin;
          if (req.headers.host) headers.host = req.headers.host;

          const sinCuerpo = req.method === 'GET' || req.method === 'HEAD';
          const request = new Request(`http://${req.headers.host || 'localhost'}/api/send-confirmation`, {
            method: req.method,
            headers,
            body: sinCuerpo ? undefined : Buffer.concat(chunks),
          });

          const { default: handler } = await import('./netlify/functions/send-confirmation.mjs');
          const response = await handler(request);

          res.statusCode = response.status;
          response.headers.forEach((valor, clave) => res.setHeader(clave, valor));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error('❌ Error en /api/send-confirmation (dev):', err);
          enviar(500, JSON.stringify({ ok: false, error: 'Error interno del endpoint' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), endpointConfirmacion()],
  server: {
    port: 5173,
    open: true,
  },
});
