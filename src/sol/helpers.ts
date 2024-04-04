import type { Metadata } from '@metaplex-foundation/mpl-token-metadata'

import { Nullable } from 'utils/typeUtils'
import { Collectible, CollectibleMediaType } from 'utils/types'

import {
  Blocklist,
  HeliusNFT,
  MetaplexNFT,
  MetaplexNFTPropertiesFile,
  SolanaNFT,
  SolanaNFTType,
  StarAtlasNFT
} from './types'

type SolanaNFTMedia = {
  collectibleMediaType: CollectibleMediaType
  url: string
  frameUrl: Nullable<string>
}

const fetchWithTimeout = async (
  resource: RequestInfo,
  options: { timeout?: number } & RequestInit = {}
) => {
  const { timeout = 4000 } = options

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  })
  clearTimeout(id)
  return response
}

/**
 * NFT is a gif if it has a file with MIME type image/gif
 * if it's a gif, we compute an image frame from the gif
 */
const metaplexNftGif = async (
  nft: MetaplexNFT
): Promise<Nullable<SolanaNFTMedia>> => {
  const gifFile = (nft.properties?.files ?? []).find(
    (file: any) => typeof file === 'object' && file.type === 'image/gif'
  )
  if (gifFile) {
    let url = (gifFile as MetaplexNFTPropertiesFile).uri
    if (!url) {
      url = (gifFile as unknown as any).file
    }
    // frame url for the gif is computed later in the collectibles page
    return {
      collectibleMediaType: CollectibleMediaType.GIF,
      url,
      frameUrl: null
    }
  }
  return null
}

/**
 * NFT is a 3D object if:
 * - its category is vr, or
 * - it has an animation url that ends in glb, or
 * - it has a file whose type is glb, or
 *
 * if the 3D has a poster/thumbnail, it would be:
 * - either in the image property, or
 * - the properties files with a type of image
 */
const metaplexNftThreeDWithFrame = async (
  nft: MetaplexNFT
): Promise<Nullable<SolanaNFTMedia>> => {
  const files = nft.properties?.files ?? []
  const objFile = files.find(
    (file: any) => typeof file === 'object' && file.type?.includes('glb')
  ) as MetaplexNFTPropertiesFile
  const objUrl = files.find(
    (file: any) => typeof file === 'string' && file.endsWith('glb')
  ) as string
  const is3DObject =
    nft.properties?.category === 'vr' ||
    nft.animation_url?.endsWith('glb') ||
    objFile ||
    objUrl
  if (is3DObject) {
    let frameUrl
    if (!nft.image?.endsWith('glb')) {
      frameUrl = nft.image
    } else {
      const imageFile = files?.find(
        (file: any) => typeof file === 'object' && file.type?.includes('image')
      ) as MetaplexNFTPropertiesFile
      if (imageFile) {
        frameUrl = imageFile.uri
      }
    }
    if (frameUrl) {
      let url: string
      if (nft.animation_url && nft.animation_url.endsWith('glb')) {
        url = nft.animation_url
      } else if (objFile) {
        url = objFile.uri
      } else if (objUrl) {
        url = objUrl
      } else {
        return null
      }
      return {
        collectibleMediaType: CollectibleMediaType.THREE_D,
        url,
        frameUrl
      }
    }
  }
  return null
}

/**
 * NFT is a video if:
 * - its category is video, or
 * - it has an animation url that does not end in glb, or
 * - it has a file whose type is video, or
 * - it has a file whose url includes watch.videodelivery.net
 *
 * if the video has a poster/thumbnail, it would be in the image property
 * otherwise, we later use the first video frame as the thumbnail
 */
const metaplexNftVideo = async (
  nft: MetaplexNFT
): Promise<Nullable<SolanaNFTMedia>> => {
  const files = nft.properties?.files ?? []
  // In case we want to restrict to specific file extensions, see below link
  // https://github.com/metaplex-foundation/metaplex/blob/81023eb3e52c31b605e1dcf2eb1e7425153600cd/js/packages/web/src/views/artCreate/index.tsx#L318
  const videoFile = files.find(
    (file: any) =>
      typeof file === 'object' &&
      file.type?.includes('video') &&
      !file.type?.endsWith('glb')
  ) as MetaplexNFTPropertiesFile
  const videoUrl = files.find(
    (file: any) =>
      typeof file === 'string' &&
      // https://github.com/metaplex-foundation/metaplex/blob/397ceff70b3524aa0543540584c7200c79b198a0/js/packages/web/src/components/ArtContent/index.tsx#L107
      file.startsWith('https://watch.videodelivery.net/')
  ) as string
  const isVideo =
    nft.properties?.category === 'video' ||
    (nft.animation_url && !nft.animation_url.endsWith('glb')) ||
    videoFile ||
    videoUrl
  if (isVideo) {
    let url: string
    if (nft.animation_url && !nft.animation_url.endsWith('glb')) {
      url = nft.animation_url
    } else if (videoFile) {
      url = videoFile.uri
    } else if (videoUrl) {
      url = videoUrl
    } else if (files.length) {
      // if there is only one file, then that's the video
      // otherwise, the second file is the video (the other files are image/audio files)
      // https://github.com/metaplex-foundation/metaplex/blob/397ceff70b3524aa0543540584c7200c79b198a0/js/packages/web/src/components/ArtContent/index.tsx#L103
      if (files.length === 1) {
        url = typeof files[0] === 'object' ? files[0].uri : files[0]
      } else {
        url = typeof files[1] === 'object' ? files[1].uri : files[1]
      }
    } else {
      return null
    }
    return {
      collectibleMediaType: CollectibleMediaType.VIDEO,
      url,
      frameUrl: nft.image || null
    }
  }
  return null
}

/**
 * NFT is an image if:
 * - its category is image, or
 * - it has a file whose type is image, or
 * - it has an image property
 */
const metaplexNftImage = async (
  nft: MetaplexNFT
): Promise<Nullable<SolanaNFTMedia>> => {
  const files = nft.properties?.files ?? []
  // In case we want to restrict to specific file extensions, see below link
  // https://github.com/metaplex-foundation/metaplex/blob/81023eb3e52c31b605e1dcf2eb1e7425153600cd/js/packages/web/src/views/artCreate/index.tsx#L316
  const imageFile = files.find(
    (file: any) => typeof file === 'object' && file.type?.includes('image')
  ) as MetaplexNFTPropertiesFile
  const isImage =
    nft.properties?.category === 'image' || nft.image?.length || imageFile
  if (isImage) {
    let url
    if (nft.image?.length) {
      url = nft.image
    } else if (imageFile) {
      url = imageFile.uri
    } else if (files.length) {
      if (files.length === 1) {
        url = typeof files[0] === 'object' ? files[0].uri : files[0]
      } else {
        url = typeof files[1] === 'object' ? files[1].uri : files[1]
      }
    } else {
      return null
    }
    return {
      collectibleMediaType: CollectibleMediaType.IMAGE,
      url,
      frameUrl: url
    }
  }
  return null
}

/**
 * If not easily discoverable tha nft is gif/video/image, we check whether it has files
 * if it does not, then we discard the nft
 * otherwise, we fetch the content type of the first file and check its MIME type:
 * - if gif, we also compute an image frame from it
 * - if video, we later use the first video frame as the thumbnail
 * - if image, the image url is also the frame url
 */
const metaplexNftComputedMedia = async (
  nft: MetaplexNFT
): Promise<Nullable<SolanaNFTMedia>> => {
  const files = nft.properties?.files ?? []
  if (!files.length) {
    return null
  }

  const url = typeof files[0] === 'object' ? files[0].uri : files[0]
  const headResponse = await fetchWithTimeout(url, { method: 'HEAD' })
  const contentType = headResponse.headers.get('Content-Type')
  if (contentType?.includes('gif')) {
    // frame url for the gif is computed later in the collectibles page
    return {
      collectibleMediaType: CollectibleMediaType.GIF,
      url,
      frameUrl: null
    }
  }
  if (contentType?.includes('video')) {
    return {
      collectibleMediaType: CollectibleMediaType.VIDEO,
      url,
      frameUrl: null
    }
  }
  if (contentType?.includes('image')) {
    return {
      collectibleMediaType: CollectibleMediaType.IMAGE,
      url,
      frameUrl: url
    }
  }

  return null
}

const starAtlasNFTToCollectible = async (
  nft: StarAtlasNFT,
  solanaChainMetadata: Nullable<Metadata>
): Promise<Collectible> => {
  const identifier = [nft._id, nft.symbol, nft.name, nft.image]
    .filter(Boolean)
    .join(':::')

  const collectible = {
    id: identifier,
    tokenId: nft._id,
    name: nft.name,
    description: nft.description,
    isOwned: true,
    chain: 'sol',
    solanaChainMetadata
  } as Collectible

  // todo: check if there are gif or video nfts for star atlas
  const is3DObj = [nft.image, nft.media?.thumbnailUrl]
    .filter(Boolean)
    .some((item) =>
      ['glb', 'gltf'].some((extension) => item.endsWith(extension))
    )
  const hasImageFrame = [nft.image, nft.media?.thumbnailUrl]
    .filter(Boolean)
    .some((item) =>
      ['glb', 'gltf'].every((extension) => !item.endsWith(extension))
    )
  if (is3DObj && hasImageFrame) {
    collectible.mediaType = CollectibleMediaType.THREE_D
    collectible.threeDUrl = ['glb', 'gltf'].some((extension) =>
      nft.image?.endsWith(extension)
    )
      ? nft.image
      : nft.media?.thumbnailUrl
    collectible.frameUrl = ['glb', 'gltf'].every(
      (extension) => !nft.image.endsWith(extension)
    )
      ? nft.image
      : nft.media?.thumbnailUrl
  } else {
    collectible.mediaType = CollectibleMediaType.IMAGE
    collectible.imageUrl = nft.image
    collectible.frameUrl = nft.media?.thumbnailUrl?.length
      ? nft.media.thumbnailUrl
      : nft.image
  }
  collectible.dateCreated = nft.createdAt

  return collectible
}

const getMediaInfo = async (
  nft: MetaplexNFT
): Promise<Nullable<SolanaNFTMedia>> => {
  try {
    const mediaInfo =
      (await metaplexNftGif(nft)) ||
      (await metaplexNftThreeDWithFrame(nft)) ||
      (await metaplexNftVideo(nft)) ||
      (await metaplexNftImage(nft)) ||
      (await metaplexNftComputedMedia(nft))
    return mediaInfo
  } catch (e) {
    return null
  }
}

const metaplexNFTToCollectible = async (
  nft: MetaplexNFT,
  solanaChainMetadata: Nullable<Metadata>,
  wallet: string
): Promise<Collectible> => {
  const identifier = [nft.symbol, nft.name, nft.image]
    .filter(Boolean)
    .join(':::')

  const collectible = {
    id: identifier,
    tokenId: identifier,
    name: nft.name,
    description: nft.description,
    externalLink: nft.external_url,
    isOwned: true,
    chain: 'sol',
    wallet,
    solanaChainMetadata
  } as Collectible

  if (
    (nft.properties?.creators ?? []).some(
      (creator: any) => creator.address === wallet
    )
  ) {
    collectible.isOwned = false
  }

  const mediaInfo = await getMediaInfo(nft)
  const { url, frameUrl, collectibleMediaType } = (mediaInfo ??
    {}) as SolanaNFTMedia
  collectible.frameUrl = frameUrl
  collectible.mediaType = collectibleMediaType
  if (collectibleMediaType === CollectibleMediaType.GIF) {
    collectible.gifUrl = url
  } else if (collectibleMediaType === CollectibleMediaType.THREE_D) {
    collectible.threeDUrl = url
  } else if (collectibleMediaType === CollectibleMediaType.VIDEO) {
    collectible.videoUrl = url
  } else if (collectibleMediaType === CollectibleMediaType.IMAGE) {
    collectible.imageUrl = url
  }

  return collectible
}

// Can build the metadata from the helius nft fields, or
// can fetch it from the json_uri of the helius nft
const getMetaplexMetadataFromHeliusNFT = async (
  nft: HeliusNFT,
  useFetch = false
): Promise<Nullable<MetaplexNFT>> => {
  try {
    if (useFetch) {
      const metaplexData = await fetch(nft.content.json_uri)
      const metaplexJson = await metaplexData.json()
      return metaplexJson as MetaplexNFT
    }
    const { metadata, links, files } = nft.content
    return {
      ...metadata,
      ...links,
      properties: {
        files: files.map((file: { uri: string; mime: string }) => ({
          uri: file.uri,
          type: file.mime
        })),
        creators: nft.creators
      }
    } as MetaplexNFT
  } catch (e) {
    return null
  }
}

const heliusNFTToCollectible = async (
  nft: HeliusNFT,
  solanaChainMetadata: Nullable<Metadata>,
  wallet: string
): Promise<Nullable<Collectible>> => {
  const { id, content, grouping, ownership } = nft
  const { metadata, links } = content
  const { name, symbol, description } = metadata
  const { image, external_url: externalUrl } = links

  const identifier = [id, symbol, name, image].filter(Boolean).join(':::')

  const collectible = {
    id: identifier,
    tokenId: id,
    name,
    description,
    externalLink: externalUrl,
    isOwned: ownership.owner === wallet,
    chain: 'sol',
    wallet,
    solanaChainMetadata
  } as Collectible

  const collectionGroup = grouping.find(
    ({ group_key }) => group_key === 'collection'
  )
  if (collectionGroup && collectionGroup.collection_metadata) {
    collectible.heliusCollection = {
      address: collectionGroup.group_value,
      name: collectionGroup.collection_metadata.name,
      imageUrl: collectionGroup.collection_metadata.image,
      externalLink: collectionGroup.collection_metadata.external_url
    }
  }

  const metaplexMetadata = await getMetaplexMetadataFromHeliusNFT(nft, true)
  if (!metaplexMetadata) {
    console.warn(
      `Could not get nft media info from Helius fields for nft with id ${nft.id}.`
    )
    return null
  }
  const mediaInfo = await getMediaInfo(metaplexMetadata)
  if (!mediaInfo) {
    console.warn(
      `Could not get nft media info from Helius metaplex metadata for nft with id ${nft.id}.`
    )
    return null
  }
  const { url, frameUrl, collectibleMediaType } = mediaInfo
  collectible.frameUrl = frameUrl
  collectible.mediaType = collectibleMediaType
  if (collectibleMediaType === CollectibleMediaType.GIF) {
    collectible.gifUrl = url
  } else if (collectibleMediaType === CollectibleMediaType.THREE_D) {
    collectible.threeDUrl = url
  } else if (collectibleMediaType === CollectibleMediaType.VIDEO) {
    collectible.videoUrl = url
  } else if (collectibleMediaType === CollectibleMediaType.IMAGE) {
    collectible.imageUrl = url
  }

  return collectible
}

const audiusBlocklistUrls = [
  '.pro',
  '.site',
  '.click',
  '.fun',
  'sol-drift.com',
  'myrovoucher.com',
  'magiceden.club',
  'tensor.markets',
  'mnde.network',
  '4000w.io',
  'juppi.io',
  'jupdao.com',
  'jupgem.com',
  'juptreasure.com',
  'slerfdrop.com',
  'airdrop.drift.exchange'
]
const audiusBlocklistNames = [
  '$1000',
  '00jup',
  'airdrop',
  'voucher',
  ...audiusBlocklistUrls
]
export const isHeliusNFTValid = (nft: HeliusNFT, blocklist: Blocklist) => {
  const {
    blocklist: urlBlocklist,
    nftBlocklist,
    stringFilters: { nameContains, symbolContains }
  } = blocklist
  const {
    grouping,
    content: {
      metadata: { name, symbol },
      links: { external_url: externalUrl }
    }
  } = nft
  const urlBlocklistExtended = [...urlBlocklist, ...audiusBlocklistUrls]
  const isExternalUrlBlocked = urlBlocklistExtended.some((item) =>
    externalUrl?.toLowerCase().includes(item.toLowerCase())
  )
  if (isExternalUrlBlocked) {
    return false
  }
  const isNftIdBlocked = nftBlocklist.includes(nft.id)
  if (isNftIdBlocked) {
    return false
  }
  const nameContainsExtended = [...nameContains, ...audiusBlocklistNames]
  const isNameBlocked = nameContainsExtended.some((item) =>
    name?.toLowerCase().includes(item.toLowerCase())
  )
  if (isNameBlocked) {
    return false
  }
  const isCollectionNameBlocked = grouping.some((group) =>
    nameContainsExtended.some((item) =>
      group.collection_metadata?.name
        ?.toLowerCase()
        .includes(item.toLowerCase())
    )
  )
  if (isCollectionNameBlocked) {
    return false
  }
  const isSymbolBlocked = symbolContains.some((item) =>
    symbol?.toLowerCase().includes(item.toLowerCase())
  )
  if (isSymbolBlocked) {
    return false
  }
  return true
}

export const solanaNFTToCollectible = async (
  nft: SolanaNFT,
  wallet: string,
  type: SolanaNFTType,
  solanaChainMetadata: Nullable<Metadata>
): Promise<Nullable<Collectible>> => {
  let collectible: Nullable<Collectible> = null
  try {
    switch (type) {
      case SolanaNFTType.HELIUS:
        collectible = await heliusNFTToCollectible(
          nft as HeliusNFT,
          solanaChainMetadata,
          wallet
        )
        break
      case SolanaNFTType.METAPLEX:
        collectible = await metaplexNFTToCollectible(
          nft as MetaplexNFT,
          solanaChainMetadata,
          wallet
        )
        break
      case SolanaNFTType.STAR_ATLAS:
        collectible = await starAtlasNFTToCollectible(
          nft as StarAtlasNFT,
          solanaChainMetadata
        )
        break
      default:
        break
    }
    return collectible
  } catch (e) {
    return null
  }
}
