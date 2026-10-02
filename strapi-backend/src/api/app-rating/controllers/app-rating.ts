/**
 * Extensions du controller app-rating (portage de apprating.controller.js).
 * - GET /api/app-ratings/average-rating
 * - GET /api/app-ratings/total-stars
 */
import { factories } from '@strapi/strapi';

const UID = 'api::app-rating.app-rating';

export default factories.createCoreController(UID, () => ({
  // GET /api/app-ratings/ (public) — liste {session_id, stars} (forme legacy)
  async find(ctx: any) {
    try {
      const rows = (await strapi.documents(UID).findMany({
        fields: ['session_id', 'stars'],
        limit: -1,
      })) as any[];
      ctx.body = rows.map((r) => ({ session_id: r.session_id, stars: r.stars }));
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // POST /api/app-ratings/ (public) — soumission d'une note
  async create(ctx: any) {
    try {
      const { stars, session_id } = ctx.request.body || {};
      const value = Number(stars);
      if (!Number.isFinite(value) || value < 1 || value > 5) {
        return ctx.badRequest('Invalid rating');
      }
      const created = await strapi.documents(UID).create({
        data: { stars: value, session_id: String(session_id ?? '') } as any,
      });
      ctx.status = 201;
      ctx.body = { message: 'Rating saved successfully', data: created };
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/app-ratings/average-rating
  async averageRating(ctx: any) {
    try {
      const rows = (await strapi.documents(UID).findMany({
        fields: ['stars'],
        limit: -1,
      })) as any[];
      if (rows.length === 0) {
        ctx.body = { average_rating: 0 };
        return;
      }
      const avg = rows.reduce((s, r) => s + (r.stars || 0), 0) / rows.length;
      ctx.body = { average_rating: parseFloat(avg.toFixed(1)) };
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/app-ratings/total-stars
  async totalStars(ctx: any) {
    try {
      const rows = (await strapi.documents(UID).findMany({
        fields: ['stars'],
        limit: -1,
      })) as any[];
      ctx.body = { total_stars: rows.reduce((s, r) => s + (r.stars || 0), 0) };
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },
}));
