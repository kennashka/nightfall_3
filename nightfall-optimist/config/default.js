module.exports = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
  MONGO_URL: process.env.MONGO_URL || 'mongodb://localhost:27017/',
  OPTIMIST_DB: 'optimist_data',
  METADATA_COLLECTION: 'metadata',
  TRANSACTIONS_COLLECTION: 'transactions',
  SUBMITTED_BLOCKS_COLLECTION: 'blocks',
  NULLIFIER_COLLECTION: 'nullifiers',
  COMMIT_COLLECTION: 'commits',
  ZKP_KEY_LENGTH: 32, // use a 32 byte key length for SHA compatibility
  ZOKRATES_WORKER_URL: process.env.ZOKRATES_WORKER_URL || 'worker',
  WEBSOCKET_PORT: process.env.WEBSOCKET_PORT || 8080,
  BLOCKCHAIN_WS_HOST: process.env.BLOCKCHAIN_WS_HOST || 'openethereum',
  BLOCKCHAIN_PORT: process.env.BLOCKCHAIN_PORT || '8546',
  TIMBER_HOST: process.env.TIMBER_HOST || 'timber',
  TIMBER_PORT: process.env.TIMBER_PORT || 80,
  WEB3_OPTIONS: {
    gas: process.env.GAS || 1000000,
    gasPrice: process.env.GAS_PRICE || '20000000000',
    from: process.env.FROM_ADDRESS || undefined,
  },
  CONTRACT_ARTIFACTS: '/app/build/contracts',
  SHIELD_CONTRACT_NAME: 'Shield',
  CHALLENGES_CONTRACT_NAME: 'Challenges',
  PROPOSERS_CONTRACT_NAME: 'Proposers',
  PROVING_SCHEME: 'gm17',
  BACKEND: 'libsnark',
  CURVE: 'bn128',
  BN128_PRIME: 21888242871839275222246405745257275088548364400416034343698204186575808495617n,
  RETRIES: 50,
  NODE_HASHLENGTH: 32,
  ZERO: '0x0000000000000000000000000000000000000000000000000000000000000000',
  HASH_TYPE: 'mimc',
  TRANSACTIONS_PER_BLOCK: 2,
  TIMBER_SYNC_RETRIES: 5, // Sets amount of exponential backoff attempts to sync with timber.
};