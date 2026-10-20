// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'confirmation-api-dev',
      configureServer(server) {
        server.middlewares.use('/api/send-confirmation', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            return res.end('Method Not Allowed');
          }

          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const { enviarConfirmacionInmediata } = await import('./mailer.mjs');
              const resultado = await enviarConfirmacionInmediata(data);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(resultado));
            } catch (err) {
              console.error('❌ Error enviando confirmación en dev server:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        });
      },
    },
  ],
  server: {
    port: 5173,
    open: true,
  },
});
