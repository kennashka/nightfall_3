import fs from 'fs';
import path from 'path';
import logger from 'common-files/utils/logger.mjs';
import { compile, extractVk, exportKeys, setup } from '../zokrates-lib/index.mjs';

export default async function generateKeys({ filepath, curve = 'bn128' }) {
  const outputPath = `./output`;
  const circuitsPath = `./circuits`;

  const ext = path.extname(filepath);
  const circuitName = path.basename(filepath, '.zok'); // filename without '.zok'
  const circuitDir = filepath.replace(ext, '');

  fs.mkdirSync(`${outputPath}/${circuitDir}`, { recursive: true });

  logger.info(
    `${circuitsPath}/${filepath}`,
    `${outputPath}/${circuitDir}`,
    `${circuitName}_out`,
    curve,
  );

  logger.info('Compile...');
  await compile(
    `${circuitsPath}/${filepath}`,
    `${outputPath}/${circuitDir}`,
    `${circuitName}`,
    curve,
  );

  if (process.env.MPC) {
    logger.info('Export keys...');
    await exportKeys(`${outputPath}/${circuitDir}`, `${circuitName}`);
  } else {
    logger.info('Setup...');
    await setup(
      `${outputPath}/${circuitDir}/${circuitName}_out`,
      `${outputPath}/${circuitDir}`,
      'g16',
      'bellman',
      `${circuitName}_vk`,
      `${circuitName}_pk`,
    );
  }

  const vk = await extractVk(`${outputPath}/${circuitDir}/${circuitName}_vk.key`);

  logger.info(`Complete ${filepath}`);
  return { vk, filepath };
}
