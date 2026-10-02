export default {
  routes: [
    {
      method: 'POST',
      path: '/subscribers/subscribe',
      handler: 'subscriber.subscribe',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/subscribers/confirm/:token',
      handler: 'subscriber.confirmSubscription',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/subscribers/unsubscribe/:token',
      handler: 'subscriber.unsubscribe',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
