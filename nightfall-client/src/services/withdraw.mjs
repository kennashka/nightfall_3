/**
This module contains the logic needed create a zkp transfer, i.e. to nullify
two input commitments and create two new output commitments to the same value.
It is agnostic to whether we are dealing with an ERC20 or ERC721 (or ERC1155).
 * @module deposit.mjs
 * @author westlad, ChaitanyaKonda, iAmMichaelConnor, will-kim
 */
import config from 'config';
import axios from 'axios';
import gen from 'general-number';
import logger from 'common-files/utils/logger.mjs';
import constants from 'common-files/constants/index.mjs';
import { waitForContract } from 'common-files/utils/contract.mjs';
import { Transaction } from '../classes/index.mjs';
import { computeCircuitInputs } from '../utils/computeCircuitInputs.mjs';
import { clearPending, markNullified, storeCommitment } from './commitment-storage.mjs';
import { ZkpKeys } from './keys.mjs';
import getProposersUrl from './peers.mjs';
import { getCommitmentInfo } from '../utils/getCommitmentInfo.mjs';

const { ZOKRATES_WORKER_HOST, PROVING_SCHEME, BACKEND, PROTOCOL, USE_STUBS } = config;
const { SHIELD_CONTRACT_NAME } = constants;
const { generalise } = gen;

const MAX_WITHDRAW = 5192296858534827628530496329220096n; // 2n**112n
const NEXT_N_PROPOSERS = 3;

async function withdraw(withdrawParams) {
  logger.info('Creating a withdraw transaction');
  // let's extract the input items
  const { offchain = false, ...items } = withdrawParams;
  const { ercAddress, tokenId, value, recipientAddress, rootKey, fee } = generalise(items);

  const shieldContractInstance = await waitForContract(SHIELD_CONTRACT_NAME);

  const maticAddress = generalise(
    (await shieldContractInstance.methods.getMaticAddress().call()).toLowerCase(),
  );

  logger.debug(
    `The erc address of the token withdrawn is the following: ${ercAddress.hex(32).toLowerCase()}`,
  );

  logger.debug(`The erc address of the fee is the following: ${maticAddress.hex(32)}`);

  const withdrawValue = value.bigInt > MAX_WITHDRAW ? MAX_WITHDRAW : value.bigInt;

  const commitmentsInfo = await getCommitmentInfo({
    totalValueToSend: withdrawValue,
    fee,
    ercAddress,
    maticAddress,
    tokenId,
    rootKey,
  });

  try {
    // now we have everything we need to create a Witness and compute a proof
    const transaction = new Transaction({
      fee,
      historicRootBlockNumberL2: commitmentsInfo.blockNumberL2s,
      transactionType: 2,
      tokenType: items.tokenType,
      tokenId,
      value,
      ercAddress,
      recipientAddress,
      commitments: commitmentsInfo.newCommitments,
      nullifiers: commitmentsInfo.nullifiers,
    });

    const privateData = {
      rootKey: [rootKey, rootKey, rootKey, rootKey],
      oldCommitmentPreimage: commitmentsInfo.oldCommitments.map(o => {
        return { value: o.preimage.value, salt: o.preimage.salt };
      }),
      paths: commitmentsInfo.localSiblingPaths.map(siblingPath => siblingPath.slice(1)),
      orders: commitmentsInfo.leafIndices,
      newCommitmentPreimage: commitmentsInfo.newCommitments.map(o => {
        return { value: o.preimage.value, salt: o.preimage.salt };
      }),
      recipientPublicKeys: commitmentsInfo.newCommitments.map(o => o.preimage.zkpPublicKey),
      ercAddress,
      tokenId,
    };

    const witness = computeCircuitInputs(
      transaction,
      privateData,
      commitmentsInfo.roots,
      maticAddress,
    );
    logger.debug(`witness input is ${witness.join(' ')}`);
    // call a zokrates worker to generate the proof
    let folderpath = 'withdraw';
    if (USE_STUBS) folderpath = `${folderpath}_stub`;
    const res = await axios.post(`${PROTOCOL}${ZOKRATES_WORKER_HOST}/generate-proof`, {
      folderpath,
      inputs: witness,
      provingScheme: PROVING_SCHEME,
      backend: BACKEND,
    });
    logger.trace(`Received response ${JSON.stringify(res.data, null, 2)}`);
    const { proof } = res.data;
    // and work out the ABI encoded data that the caller should sign and send to the shield contract

    const optimisticWithdrawTransaction = new Transaction({
      fee,
      historicRootBlockNumberL2: commitmentsInfo.blockNumberL2s,
      transactionType: 2,
      tokenType: items.tokenType,
      tokenId,
      value,
      ercAddress,
      recipientAddress,
      commitments: commitmentsInfo.newCommitments,
      nullifiers: commitmentsInfo.nullifiers,
      proof,
    });

    const { compressedZkpPublicKey, nullifierKey } = new ZkpKeys(rootKey);

    // Store new commitments that are ours.
    const storeNewCommitments = commitmentsInfo.newCommitments
      .filter(c => c.compressedZkpPublicKey.hex(32) === compressedZkpPublicKey.hex(32))
      .map(c => storeCommitment(c, nullifierKey));

    const nullifyOldCommitments = commitmentsInfo.oldCommitments.map(c =>
      markNullified(c, optimisticWithdrawTransaction),
    );

    await Promise.all([...storeNewCommitments, ...nullifyOldCommitments]);

    const returnObj = { transaction: optimisticWithdrawTransaction };

    if (offchain) {
      // dig up connection peers
      const peerList = await getProposersUrl(NEXT_N_PROPOSERS);
      logger.debug(`Peer List: ${JSON.stringify(peerList, null, 2)}`);
      await Promise.all(
        Object.keys(peerList).map(async address => {
          logger.debug(
            `offchain transaction - calling ${peerList[address]}/proposer/offchain-transaction`,
          );
          return axios.post(
            `${peerList[address]}/proposer/offchain-transaction`,
            { transaction: optimisticWithdrawTransaction },
            { timeout: 3600000 },
          );
        }),
      );
    } else {
      returnObj.rawTransaction = await shieldContractInstance.methods
        .submitTransaction(Transaction.buildSolidityStruct(optimisticWithdrawTransaction))
        .encodeABI();
    }
    return returnObj;
  } catch (error) {
    logger.error('Err', error);
    await Promise.all(commitmentsInfo.oldCommitments.map(o => clearPending(o)));
    throw new Error('Failed withdraw');
  }
}

export default withdraw;
