import 'dotenv/config';
import http from 'http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '16mb' }));

  app.post('/api/parse-statement', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({
          error:
            'GEMINI_API_KEY is not configured in Secrets. You can still enter statement totals manually below.',
        });
        return;
      }

      const { pdfBase64, fileName, fallbackCurrency } = req.body as {
        pdfBase64?: string;
        fileName?: string;
        fallbackCurrency?: string;
      };

      if (!pdfBase64 || typeof pdfBase64 !== 'string') {
        res.status(400).json({ error: 'Missing PDF file payload.' });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `You are a financial accountant for "Jescamp Gifts & Deco", a gifts and decor business.
Analyze the attached PDF financial, invoice, sales, or bank/M-Pesa statement (${fileName || 'statement.pdf'}).
1. Look specifically for the statement's Subtotal amount (e.g., "Subtotal", "Sub-total", "Total Credits", "Total Inflows", "Total Revenue", or "Closing Subtotal") and return it as subtotalAmount. Also return totalRevenue (if no separate revenue figure exists, set totalRevenue equal to subtotalAmount).
2. Map expenses cleanly into these exact categories (0 if absent):
- businessMaterials: inventory, gifts, decor stock, flowers, packaging, ribbons, raw supplies.
- transportation: fuel, boda/uber/delivery, courier, shipping, logistics.
- workerSalaries: payroll, staff wages, casual labor, commissions.
- sistersSchoolFees: school fees, tuition, education payments.
- pendingLoansDebts: loan repayments, debt settlements, credit repayments.
- savingsAllocated: transfers to savings, MMF, or fixed reserve.
- growthAllocated: marketing, equipment, shop expansion, reinvestment.
- discretionarySpent: miscellaneous/personal/guilt-free spend not in the above categories.
3. Extract:
- monthKey in YYYY-MM format (infer from statement dates; default to current month if unclear).
- currency as one of KES, USD, EUR, GBP (default ${fallbackCurrency || 'KES'}).
Return accurate numeric totals only.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              monthKey: { type: Type.STRING },
              currency: { type: Type.STRING },
              subtotalAmount: { type: Type.NUMBER },
              totalRevenue: { type: Type.NUMBER },
              businessMaterials: { type: Type.NUMBER },
              transportation: { type: Type.NUMBER },
              workerSalaries: { type: Type.NUMBER },
              sistersSchoolFees: { type: Type.NUMBER },
              pendingLoansDebts: { type: Type.NUMBER },
              savingsAllocated: { type: Type.NUMBER },
              growthAllocated: { type: Type.NUMBER },
              discretionarySpent: { type: Type.NUMBER },
              summaryNotes: { type: Type.STRING },
            },
          },
        },
      });

      const text = (response.text ?? '{}').trim();
      const parsed = JSON.parse(text);
      const subtotal = Number(parsed.subtotalAmount) || 0;
      const revenue = Number(parsed.totalRevenue) || 0;
      const effectiveSubtotal = subtotal > 0 ? subtotal : revenue;
      res.json({
        ok: true,
        statement: {
          ...parsed,
          subtotalAmount: effectiveSubtotal,
          totalRevenue: effectiveSubtotal,
        },
      });
    } catch (error) {
      console.error('PDF statement parsing error:', error);
      const message =
        error instanceof Error ? error.message : 'Unable to parse PDF statement.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: hmrDisabled ? false : { server: httpServer },
        hmr: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    if (hmrDisabled) {
      app.get('/@vite/client', (_req, res) => {
        res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return \`\${pathname}?\${queryToInject}\${search ? '&' + search.slice(1) : ''}\${hash || ''}\`;
}
export class ErrorOverlay extends HTMLElement {}
`);
      });
    }

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Jescamp Gifts & Deco server listening on port ${PORT}`);
  });
}

startServer();
