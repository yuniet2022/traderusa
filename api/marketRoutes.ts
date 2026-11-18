import { Hono } from 'hono';
import { z } from 'zod';
import { marketClass, marketSymbol, marketTimeframe } from '../contracts/market';
import { createMarketService } from './marketData';
import { readSessionCookie } from './sessionUtil';
import { createUniverseService, UniverseChanged } from './marketUniverse';
import { createRobinhoodAvailability } from './robinhoodAvailability';

export function createMarketRoutes(service = createMarketService(), universe = createUniverseService(), availability = createRobinhoodAvailability()) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    if (!readSessionCookie(c.req.raw)) return c.json({ error: 'Inicia sesión para consultar el mercado.' }, 401);
    await next();
  });
  app.get('/availability',async c=>{
    const input=z.object({assetClass:marketClass,id:marketSymbol}).safeParse(c.req.query());
    if(!input.success)return c.json({error:'Activo inválido.'},400);
    return c.json(await availability.check(input.data.assetClass,input.data.id));
  });
  app.get('/universe', async c => {
    const input=z.object({offset:z.coerce.number().int().min(0).max(100000).default(0),limit:z.coerce.number().int().min(1).max(500).default(500),version:z.string().regex(/^[a-f0-9]{64}$/).optional(),refresh:z.enum(['1']).optional()}).safeParse(c.req.query());
    if(!input.success)return c.json({error:'Página de mercado inválida.'},400);
    try{return c.json(await universe.page({...input.data,refresh:input.data.refresh==='1'}));}
    catch(error){if(error instanceof UniverseChanged)return c.json({error:'El catálogo cambió; reinicia la carga.'},409);
      return c.json({error:'No se pudo consultar el catálogo de mercado.'},503);}
  });
  app.get('/history', async c => {
    const input = z.object({ assetClass: marketClass, id: marketSymbol, timeframe: marketTimeframe.default('scan') }).safeParse(c.req.query());
    if (!input.success) return c.json({ error: 'Activo o temporalidad inválidos.' }, 400);
    try { return c.json(await service.history(input.data.assetClass, input.data.id, input.data.timeframe)); }
    catch { c.header('Retry-After', '30'); return c.json({ error: 'El historial no está disponible temporalmente. Vuelve a intentarlo.' }, 503); }
  });
  app.get('/quotes', async c => {
    const input = z.object({ assetClass: marketClass, symbols: z.string().max(840).transform(value => value.split(',')).pipe(z.array(marketSymbol).min(1).max(40)) }).safeParse(c.req.query());
    if (!input.success) return c.json({ error: 'Símbolos inválidos.' }, 400);
    const quotes = await service.quotes(input.data.assetClass, input.data.symbols);
    if (!Object.keys(quotes).length) { c.header('Retry-After', '30'); return c.json({ error: 'Cotizaciones no disponibles temporalmente.' }, 503); }
    return c.json(quotes);
  });
  app.get('/search', async c => {
    const input = z.object({ q: z.string().trim().min(1).max(64) }).safeParse(c.req.query());
    if (!input.success) return c.json({ error: 'Búsqueda inválida.' }, 400);
    try { return c.json(await service.search(input.data.q)); }
    catch { c.header('Retry-After', '30'); return c.json({ error: 'Búsqueda no disponible temporalmente.' }, 503); }
  });
  app.get('/flow', async c => {
    const input = z.object({ assetClass: marketClass, id: marketSymbol }).safeParse(c.req.query());
    if (!input.success) return c.json({ error: 'Activo inválido.' }, 400);
    try { return c.json(await service.flow(input.data.assetClass, input.data.id)); }
    catch { c.header('Retry-After', '30'); return c.json({ error: 'Flujo de operaciones no disponible para este activo.' }, 503); }
  });
  return app;
}
