/* eslint-disable import/no-cycle */
/**
commitmentsync services to decrypt commitments from transaction blockproposed events
or use clientCommitmentSync to decrypt when new zkpPrivateKey is received.
*/

import logger from 'common-files/utils/logger.mjs';
import { generalise } from 'general-number';
import { edwardsDecompress } from 'common-files/utils/curve-maths/curves.mjs';
import constants from 'common-files/constants/index.mjs';
import { getAllTransactions } from './database.mjs';
import { countCommitments, storeCommitment } from './commitment-storage.mjs';
import { decrypt, packSecrets } from './kem-dem.mjs';
import { ZkpKeys } from './keys.mjs';
import Commitment from '../classes/commitment.mjs';

const { ZERO } = constants;

/**
decrypt commitments for a transaction given zkpPrivateKeys and nullifierKeys.
*/
export async function decryptCommitment(transaction, zkpPrivateKey, nullifierKey) {
  const nonZeroCommitments = transaction.commitments.flat().filter(n => n !== ZERO);
  const storeCommitments = [];
  zkpPrivateKey.forEach((key, j) => {
    const { zkpPublicKey } = ZkpKeys.calculateZkpPublicKey(generalise(key));
    try {
      const cipherTexts = [
        transaction.ercAddress,
        transaction.tokenId,
        ...transaction.compressedSecrets,
      ];
      const [packedErc, unpackedTokenID, ...rest] = decrypt(
        generalise(key),
        generalise(edwardsDecompress(transaction.recipientAddress)),
        generalise(cipherTexts),
      );
      const [erc, tokenId] = packSecrets(generalise(packedErc), generalise(unpackedTokenID), 2, 0);
      const plainTexts = generalise([erc, tokenId, ...rest]);
      const commitment = new Commitment({
        zkpPublicKey,
        ercAddress: plainTexts[0].bigInt,
        tokenId: plainTexts[1].bigInt,
        value: plainTexts[2].bigInt,
        salt: plainTexts[3].bigInt,
      });
      if (commitment.hash.hex(32) === nonZeroCommitments[0]) {
        logger.info('Successfully decrypted commitment for this recipient');
        storeCommitments.push(storeCommitment(commitment, nullifierKey[j]));
      }
    } catch (err) {
      // This error will be caught regularly if the commitment isn't for us
      // We dont print anything in order not to pollute the logs
    }
  });

  return Promise.all(storeCommitments);
}

/**
Called when new zkpPrivateKey(s) are recieved , it fetches all available commitments
from commitments collection and decrypts commitments belonging to the new zkpPrivateKey(s).
*/
export async function clientCommitmentSync(zkpPrivateKey, nullifierKey) {
  const transactions = await getAllTransactions();
  for (let i = 0; i < transactions.length; i++) {
    // filter out non zero commitments and nullifiers
    const nonZeroCommitments = transactions[i].commitments.filter(n => n !== ZERO);
    if (transactions[i].transactionType === '1' && countCommitments([nonZeroCommitments[0]]) === 0)
      decryptCommitment(transactions[i], zkpPrivateKey, nullifierKey);
  }
}
