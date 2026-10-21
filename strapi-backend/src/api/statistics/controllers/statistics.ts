/**
 * Statistiques de visites (portage de backend/src/controllers/visits.controller.js).
 *
 * Tables analytiques HORS content-types (D7) → accès SQL direct via
 * strapi.db.connection (décision validée en MIGRATION.md §2).
 *
 * Sémantique « 1 visiteur = 1 par jour » (fuseau Indian/Antananarivo) :
 *  - `visits_today`          → nombre de VISITEURS DIFFÉRENTS aujourd'hui
 *    (COUNT des empreintes dans `visites_visiteurs`) ;
 *  - `unique_visitors`       → somme des visiteurs distincts par jour
 *    (`totaux_jour.visiteurs`) sur la période demandée ;
 *  - `total_visits`          → ouvertures de l'application (`daily_stats`,
 *    alimenté par POST /api/visites/ping : un ping par montage d'app) ;
 *  - les séries par jour     → `totaux_jour` (visiteurs) + `daily_stats`
 *    (visites/ouvertures).
 *
 * Les noms de champs de réponse sont INCHANGÉS (front : VisiteursPanel,
 * RealTimeVisitors, Accueil). Le détail reste réservé à l'administrateur.
 *
 * GET /api/statistics/visit-statistics — admin
 */
import { PRESENCE_FENETRE_MINUTES, visiteursEnLigne } from '../../../utils/analytics';
import { isAdminCtx } from '../../../utils/roles';
import { countOf, rowsOf, visiteursDuJour } from '../../../utils/comptage';
// Même « jour courant » que le comptage (jourCourant = dateJourMadagascar,
// avec l'injection de test VISITOR_JOUR_FIXE) : lire et compter le même jour.
import { jourCourant } from '../../../utils/visitor-id';

export const getVisitStatistics = async (ctx: any) => {
  // Vérification du rôle admin (helper partagé : src/utils/roles.ts)
  // NB : `ctx.strapi` n'existe plus en Strapi 5 — on utilise l'instance
  // globale `strapi` (comme les autres contrôleurs du projet).
  if (!(await isAdminCtx(ctx))) {
    return ctx.forbidden();
  }

  try {
    const { start_date, end_date } = ctx.query || {};

    const params: string[] = [];
    let whereDaily = '';
    let whereTotaux = '';
    if (start_date && end_date) {
      whereDaily = ' WHERE visit_date BETWEEN ? AND ?';
      whereTotaux = ' WHERE jour BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    // Ouvertures de l'application (cumul période) — courbe grise « Visites ».
    const totalResult = await strapi.db.connection.raw(
      `SELECT SUM(total_visits) AS count FROM daily_stats${whereDaily}`,
      params
    );
    const total_visits = countOf(totalResult);

    // Visiteurs DISTINCTS (cumul journalier sur la période) : un visiteur qui
    // revient deux jours compte deux fois — même comportement qu'avant.
    const uniqueResult = await strapi.db.connection.raw(
      `SELECT SUM(visiteurs) AS count FROM totaux_jour${whereTotaux}`,
      params
    );
    const unique_visitors = countOf(uniqueResult);

    // Ouvertures par jour (daily_stats — historique préservé, sans purge).
    const perDayResult = await strapi.db.connection.raw(
      `SELECT visit_date, total_visits AS count FROM daily_stats${whereDaily} ORDER BY visit_date`,
      params
    );

    // Visiteurs distincts par jour (totaux_jour — agrégat conservé après
    // purge des empreintes détaillées).
    const uniquePerDayResult = await strapi.db.connection.raw(
      `SELECT jour AS visit_date, visiteurs AS count FROM totaux_jour${whereTotaux} ORDER BY jour`,
      params
    );

    // Visiteurs d'aujourd'hui — même jour que le comptage (jourCourant()),
    // sinon aucune ligne ne correspond.
    const today = jourCourant();
    const visits_today = await visiteursDuJour(today);

    // Présence temps réel : empreintes vues dans la fenêtre courante
    // (table visitor_presence alimentée par le middleware track-visit).
    const visitors_online = await visiteursEnLigne();

    ctx.body = {
      total_visits,
      unique_visitors,
      total_visits_per_day: rowsOf(perDayResult),
      unique_visitors_per_day: rowsOf(uniquePerDayResult),
      visits_today,
      visitors_online,
      visitors_online_window_minutes: PRESENCE_FENETRE_MINUTES,
    };
  } catch (err) {
    console.error('getVisitStatistics error:', err);
    return ctx.internalServerError((err as Error).message);
  }
};

// Strapi n'enregistre un contrôleur que s'il expose un export `default`.
export default { getVisitStatistics };
