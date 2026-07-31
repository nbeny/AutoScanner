import type { ChainDefinition } from '../types';
import { IpReconFullChain } from './ip-recon-full';
import { WebFullChain } from './web-full';

export { IpReconFullChain, WebFullChain };

/** Source unique de vérité des chaînes builtin (consommée par le worker/API). */
export const BUILTIN_CHAINS: readonly ChainDefinition[] = [IpReconFullChain, WebFullChain];
