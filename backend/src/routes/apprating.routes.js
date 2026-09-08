const router = require('express').Router();
const {
  submitRating,
  getRatings,
  getAverageRating,
  getTotalStars,
} = require('../controllers/apprating.controller');

// Support /submit-rating/ and /app-ratings/
router.route('/submit-rating/')
  .post(submitRating)
  .get(getRatings);

router.route('/submit-rating')
  .post(submitRating)
  .get(getRatings);

router.route('/app-ratings/')
  .post(submitRating)
  .get(getRatings);

router.route('/app-ratings')
  .post(submitRating)
  .get(getRatings);

// Averages
router.get('/average-rating/', getAverageRating);
router.get('/average-rating', getAverageRating);
router.get('/app-ratings/average_rating/', getAverageRating);
router.get('/app-ratings/average_rating', getAverageRating);

// Total stars
router.get('/total-stars/', getTotalStars);
router.get('/total-stars', getTotalStars);
router.get('/app-ratings/total_stars/', getTotalStars);
router.get('/app-ratings/total_stars', getTotalStars);

module.exports = router;
