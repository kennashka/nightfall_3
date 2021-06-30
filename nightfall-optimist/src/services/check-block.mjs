/**
Module to check that submitted Blocks and Transactions are valid
*/
import { getTreeHistoryByCurrentLeafCount } from '../utils/timber.mjs';
import logger from '../utils/logger.mjs';
import BlockError from '../classes/block-error.mjs';
import checkTransaction from './transaction-checker.mjs';
import {
  numberOfBlockWithTransactionHash,
  retrieveMinedNullifiers,
  getBlockByBlockNumberL2,
} from './database.mjs';
/**
Checks the block's properties.  It will return the first inconsistency it finds
@param {object} block - the block being checked
@param {array} transactions - array of transaction objects whose transaction hashes are contained in the block (in hash order).
TODO - nullifiers
*/

async function checkBlock(block, transactions) {
  // Check that the leafCount is correct
  // we do this first because subsequent checks are reliant on the leafCount
  // being correct!
  // We need to get hold of the prior block to do this because the leafCount
  // is derrived from data in that block.
  if (block.blockNumberL2 > 0) {
    const priorBlock = await getBlockByBlockNumberL2(block.blockNumberL2 - 1);
    if (priorBlock === null) logger.warn('Could not find prior block while checking leaf count');
    if (priorBlock.leafCount + priorBlock.nCommitments !== block.leafCount)
      throw new BlockError('The leaf count in the block is not correct', 7);
  } else if (block.leafCount !== 0)
    // this throws if it's the first block and leafCount!=0, which is impossible
    throw new BlockError('The leaf count in the block is not correct', 7);

  // now we have to check the commitment root.  For this we can make use of
  // Timber with its optimistic extensions.
  logger.debug(`Checking block with leafCount ${block.leafCount}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  const history = await getTreeHistoryByCurrentLeafCount(block.leafCount);
  logger.debug(`Retrieved history from Timber`);
  logger.silly(`Timber history was ${JSON.stringify(history, null, 2)}`);
  if (history.root !== block.root)
    throw new BlockError(
      `The block's root (${block.root}) cannot be reconstructed from the commitment hashes in the transactions in this block and the historic Frontier held by Timber for this root`,
      0,
    );

  // check if the transactions in the block have not already been submitted
  // This will also capture a duplicate block error
  await Promise.all(
    transactions.map(async (transaction, index) => {
      if ((await numberOfBlockWithTransactionHash(transaction.transactionHash)) > 1)
        throw new BlockError(
          `The transaction with transaction hash (${transaction.transactionHash}) has already been submitted, hence this block is incorrect`,
          1,
          { transactionHashIndex: index, transactionHash: transaction.transactionHash },
        );
    }),
  );

  // Check nullifiers for duplicates that have already been mined.
  const storedMinedNullifiers = await retrieveMinedNullifiers(); // List of Nullifiers stored by blockProposer
  const blockNullifiers = transactions.map(tNull => tNull.nullifiers).flat(Infinity); // List of Nullifiers in block
  const alreadyMinedNullifiers = storedMinedNullifiers.filter(sNull =>
    blockNullifiers.includes(sNull.hash),
  );
  if (alreadyMinedNullifiers.length > 0) {
    throw new BlockError(
      `Some Nullifiers included in ${block.root} have been included in previous blocks`,
      6,
    );
  }

  // This concludes all 'block-level' checks i.e. checks which require the context of this block w.r.t the existing L2 State.

  // The transaction checks below are 'stateless'.
  // check if the transaction is valid - transaction type, public input hash and proof verification are all checked
  for (let i = 0; i < transactions.length; i++) {
    try {
      await checkTransaction(transactions[i]); // eslint-disable-line no-await-in-loop
    } catch (err) {
      if (err.code !== 2) {
        // Error 2 of transaction checker does not need a challenge
        throw new BlockError(
          `The transaction check failed with error: ${err.message}`,
          err.code === 1 ? 2 : err.code, // mapping transaction error to block error
          {
            transaction: transactions[i],
            transactionHashIndex: block.transactionHashes.indexOf(transactions[i].transactionHash),
          },
        );
      }
    }
  }
}

export default checkBlock;
