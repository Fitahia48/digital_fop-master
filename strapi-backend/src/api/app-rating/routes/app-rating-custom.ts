/**
 * Routes custom app-rating (URLs legacy, publiques).
 * Le front appelle les variantes soulignées `/average_rating/` et `/total_stars/`
 * (les variantes tiretées sont conservées pour la lisibilité REST).
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/app-ratings/average-rating',
      handler: 'app-rating.averageRating',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/app-ratings/average_rating',
      handler: 'app-rating.averageRating',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/app-ratings/total-stars',
      handler: 'app-rating.totalStars',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/app-ratings/total_stars',
      handler: 'app-rating.totalStars',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
