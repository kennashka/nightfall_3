/**
Module to handle new Transactions being posted
*/
import logger from 'common-files/utils/logger.mjs';
import {
  saveTransaction,
  getBlockByTransactionHash,
  getTransactionByTransactionHash,
} from '../services/database.mjs';
import checkTransaction from '../services/transaction-checker.mjs';
import TransactionError from '../classes/transaction-error.mjs';
import { getTransactionSubmittedCalldata } from '../services/process-calldata.mjs';

/**
it's possible this is a replay or a re-mine of a transaction that's already
in a block. Check for this.  This is not part of the general transaction
check because we don't want to do it as part of the block check, only when the
transaction is received. If we did it as part of the block check it would fail
because at that point we're bound to have the transaction both in the mempool and
in the block.
*/
async function checkAlreadyInBlock(_transaction) {
  const transaction = { ..._transaction };
  const [block] = await getBlockByTransactionHash(transaction.transactionHash);
  if (!block) return transaction; // all ok, we've not seen this before
  const storedTransaction = await getTransactionByTransactionHash(transaction.transactionHash);
  if (storedTransaction?.blockNumber)
    // it's a re-play of an existing transaction that's in a block
    throw new TransactionError('This transaction has been processed previously', 6);
  // it's a re-mine of an existing transaction that's in a block
  transaction.mempool = false; // we don't want to put it in another block or we'll get a duplicate transaction challenge
  logger.debug(
    `Transaction ${transaction.transactionHash} has been re-mined but is already in a block - setting mempool to false`,
  );
  return transaction; // but it's otherwise ok
}

/**
This handler runs whenever a new transaction is submitted to the blockchain
*/
async function transactionSubmittedEventHandler(eventParams) {
  const { offchain = false, fromBlockProposer, ...data } = eventParams;
  let transaction;
  if (offchain) {
    transaction = data;
    transaction.blockNumber = 'offchain';
    transaction.transactionHashL1 = 'offchain';
  } else {
    transaction = await getTransactionSubmittedCalldata(data);
    transaction.blockNumber = data.blockNumber;
    transaction.transactionHashL1 = data.transactionHash;
  }
  logger.info(`Transaction Handler - New transaction received.`);
  logger.debug(`Transaction was ${JSON.stringify(transaction, null, 2)}`);
  try {
    transaction = await checkAlreadyInBlock(transaction);
    await checkTransaction(transaction, true);
    logger.info('Transaction checks passed');
    saveTransaction({ ...transaction }); // then we need to save it
  } catch (err) {
    if (err instanceof TransactionError)
      logger.warn(
        `The transaction check failed with error: ${err.message}. The transaction has been ignored`,
      );
    else logger.error(err.stack);
    if (fromBlockProposer) saveTransaction({ ...transaction }); // then we need to save it
  }
}

export default transactionSubmittedEventHandler;
