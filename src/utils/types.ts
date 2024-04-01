
import { Metadata } from '@metaplex-foundation/mpl-token-metadata'

import { EthTokenStandard } from 'eth/types'
import { HeliusCollection } from 'sol/types'
import { Nullable } from 'utils/typeUtils'

export type Chain = 'eth' | 'sol'

export type CollectiblesMetadata = {
  [key: string]: object
  order: string[]
}

export enum CollectibleMediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  GIF = 'GIF',
  THREE_D = 'THREE_D'
}

export type Collectible = {
  id: string
  tokenId: string
  name: Nullable<string>
  description: Nullable<string>
  mediaType: CollectibleMediaType
  frameUrl: Nullable<string>
  imageUrl: Nullable<string>
  gifUrl: Nullable<string>
  videoUrl: Nullable<string>
  threeDUrl: Nullable<string>
  animationUrl: Nullable<string>
  hasAudio: boolean
  isOwned: boolean
  dateCreated: Nullable<string>
  dateLastTransferred: Nullable<string>
  externalLink: Nullable<string>
  permaLink: Nullable<string>
  chain: Chain
  wallet: string
  duration?: number

  // ethereum nfts
  assetContractAddress: Nullable<string>
  standard: Nullable<EthTokenStandard>
  collectionSlug: Nullable<string>
  collectionName: Nullable<string>
  collectionImageUrl: Nullable<string>

  // solana nfts
  solanaChainMetadata?: Nullable<Metadata>
  heliusCollection?: Nullable<HeliusCollection>
}

export type CollectibleState = {
  [wallet: string]: Collectible[]
}
