export default {
  SCYLLA_MAX_CARTESIAN_PRODUCT_SIZE: 100,
  VERBOSE: true,
  PORT: '50330',
  ENV: 'development',
  IS_STAGING: false,
  DEV_USE_HTTPS: false,
  MAX_CPU: 1,
  BCRYPT_ROUNDS: 10,
  FRONTEND_HOST: 'localhost:50340',
  DEFAULT_NOTIFICATIONS: {},
  REDIS: {
    PREFIX: 'spore_coding_challenge',
    PORT: 6379,
    CACHE_HOST: 'localhost'
  },
  SCYLLA: {
    KEYSPACE: 'spore_coding_challenge',
    PORT: 9042,
    CONTACT_POINTS: ['localhost']
  },
  ELASTICSEARCH: { PORT: 9200, HOST: 'localhost' },
  ENVS: { DEV: 'development', PROD: 'production', TEST: 'test' }
}
