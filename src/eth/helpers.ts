import dayjs from 'dayjs'

import { Nullable } from 'utils/typeUtils'
import { Collectible, CollectibleMediaType } from 'utils/types'

import placeholderCoverArt from '../assets/img/imageCollectiblePlaceholder2x.webp'

import { EthTokenStandard, OpenSeaEvent, OpenSeaEventExtended, OpenSeaNftExtended } from './types'

export const fetchWithTimeout = async (
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

const isWebpAnimated = (arrayBuffer: ArrayBuffer) => {
  const decoder = new TextDecoder('utf-8')
  const text = decoder.decode(arrayBuffer)
  return text.indexOf('ANMF') !== -1
}

/**
 * extensions based on OpenSea metadata standards
 * https://docs.opensea.io/docs/metadata-standards
 */
const OPENSEA_AUDIO_EXTENSIONS = ['mp3', 'wav', 'oga']
const OPENSEA_VIDEO_EXTENSIONS = [
  'gltf',
  'glb',
  'webm',
  'mp4',
  'm4v',
  'ogv',
  'ogg',
  'mov'
]

const SUPPORTED_VIDEO_EXTENSIONS = ['webm', 'mp4', 'ogv', 'ogg', 'mov']
const SUPPORTED_3D_EXTENSIONS = ['gltf', 'glb']

const NON_IMAGE_EXTENSIONS = [
  ...OPENSEA_VIDEO_EXTENSIONS,
  ...OPENSEA_AUDIO_EXTENSIONS
]

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'

const isAssetImage = (asset: OpenSeaNftExtended) => {
  return [
    asset.image,
    asset.image_url,
    asset.image_original_url,
    asset.image_preview_url,
    asset.image_thumbnail_url
  ].some(
    (url) => url && NON_IMAGE_EXTENSIONS.every((ext) => !url.endsWith(ext))
  )
}

const areUrlExtensionsSupportedForType = (
  asset: OpenSeaNftExtended,
  extensions: string[]
) => {
  const {
    animation_url,
    animation_original_url,
    image_url,
    image,
    image_original_url,
    image_preview_url,
    image_thumbnail_url
  } = asset
  return [
    animation_url || '',
    animation_original_url || '',
    image_url,
    image,
    image_original_url,
    image_preview_url,
    image_thumbnail_url
  ].some((url) => url && extensions.some((ext) => url.endsWith(ext)))
}

const isAssetVideo = (asset: OpenSeaNftExtended) => {
  return areUrlExtensionsSupportedForType(asset, SUPPORTED_VIDEO_EXTENSIONS)
}

const isAssetThreeDAndIncludesImage = (asset: OpenSeaNftExtended) => {
  return (
    areUrlExtensionsSupportedForType(asset, SUPPORTED_3D_EXTENSIONS) &&
    isAssetImage(asset)
  )
}

const isAssetGif = (asset: OpenSeaNftExtended) => {
  return !!(
    asset.image?.endsWith('.gif') ||
    asset.image_url?.endsWith('.gif') ||
    asset.image_original_url?.endsWith('.gif') ||
    asset.image_preview_url?.endsWith('.gif') ||
    asset.image_thumbnail_url?.endsWith('.gif')
  )
}

export const isAssetValid = (asset: OpenSeaNftExtended) => {
  return (
    isAssetGif(asset) ||
    isAssetThreeDAndIncludesImage(asset) ||
    isAssetVideo(asset) ||
    isAssetImage(asset)
  )
}

const ipfsProtocolPrefix = 'ipfs://'
const getIpfsProtocolUrl = (asset: OpenSeaNftExtended) => {
  return [
    asset.image,
    asset.image_url,
    asset.image_original_url,
    asset.image_preview_url,
    asset.image_thumbnail_url,
    asset.animation_url,
    asset.animation_original_url
  ].find((url) => url?.startsWith(ipfsProtocolPrefix))
}
const getIpfsMetadataUrl = (ipfsProtocolUrl: string) => {
  const url = ipfsProtocolUrl
    .substring(ipfsProtocolPrefix.length)
    .replace('ipfs/', '')
  return `https://ipfs.io/ipfs/${url}`
}
const arweavePrefix = 'ar://'
const getArweaveProtocolUrl = (asset: OpenSeaNftExtended) => {
  return [
    asset.image,
    asset.image_url,
    asset.image_original_url,
    asset.image_preview_url,
    asset.image_thumbnail_url,
    asset.animation_url,
    asset.animation_original_url
  ].find((url) => url?.startsWith(arweavePrefix))
}
const getArweaveMetadataUrl = (arweaveProtocolUrl: string) => {
  return `https://arweave.net/${arweaveProtocolUrl.substring(
    arweavePrefix.length
  )}`
}

export const getAssetIdentifier = (asset: OpenSeaNftExtended) => {
  return `${asset.identifier}:::${asset.contract ?? ''}`
}

/**
 * Returns a collectible given an asset object from the OpenSea API
 *
 * A lot of the work here is to determine whether a collectible is a gif, a video, or an image
 *
 * If the collectible is a gif, we set the gifUrl, and we process a frame from the gifUrl which we set as its frameUrl
 *
 * If the collectible is a video, we set the videoUrl, and we check whether the asset has an image
 * - if it has an image, we check whether the image url is an actual image or a video (sometimes OpenSea returns
 *   videos in the image url properties of the asset)
 *   - if it's an image, we set it as the frameUrl
 *   - otherwise, we unset the frameUrl
 * - if not, we do not set the frameUrl
 * Video collectibles that do not have a frameUrl will use the video paused at the first frame as the thumbnail
 * in the collectibles tab
 *
 * Otherwise, we consider the collectible to be an image, we get the image url and make sure that it is not
 * a gif or a video
 * - if it's a gif, we follow the above gif logic
 * - if it's a video, we unset the frameUrl and follow the above video logic
 * - otherwise, we set the frameUrl and the imageUrl
 *
 * @param asset
 */
export const assetToCollectible = async (
  asset: OpenSeaNftExtended
): Promise<Collectible> => {
  let mediaType: CollectibleMediaType
  let frameUrl: Nullable<string> = null
  let imageUrl: Nullable<string> = null
  let videoUrl: Nullable<string> = null
  let threeDUrl: Nullable<string> = null
  let gifUrl: Nullable<string> = null

  let hasAudio = false
  let animationUrlOverride: Nullable<string> = null

  const {
    animation_url,
    animation_original_url,
    image,
    image_url,
    image_original_url,
    image_preview_url,
    image_thumbnail_url
  } = asset
  const imageUrls = [
    image,
    image_url,
    image_original_url,
    image_preview_url,
    image_thumbnail_url
  ]

  const ipfsProtocolUrl = getIpfsProtocolUrl(asset)
  const arweaveProtocolUrl = getArweaveProtocolUrl(asset)

  try {
    if (isAssetGif(asset)) {
      mediaType = CollectibleMediaType.GIF
      // frame url for the gif is computed later in the collectibles page
      frameUrl = null
      gifUrl = imageUrls.find((url) => url?.endsWith('.gif'))!
      if (ipfsProtocolUrl) {
        gifUrl = getIpfsMetadataUrl(gifUrl)
      }
    } else if (isAssetThreeDAndIncludesImage(asset)) {
      mediaType = CollectibleMediaType.THREE_D
      threeDUrl = [animation_url, animation_original_url, ...imageUrls].find(
        (url) => url && SUPPORTED_3D_EXTENSIONS.some((ext) => url.endsWith(ext))
      )!
      frameUrl = imageUrls.find(
        (url) => url && NON_IMAGE_EXTENSIONS.every((ext) => !url.endsWith(ext))
      )!
      // image urls may not end in known extensions
      // just because the don't end with the NON_IMAGE_EXTENSIONS above does not mean they are images
      // they may be gifs
      // example: https://lh3.googleusercontent.com/rOopRU-wH9mqMurfvJ2INLIGBKTtF8BN_XC7KZxTh8PPHt5STSNJ-i8EQit8ZTwE3Mi8LK4on_4YazdC3Cl-HdaxbnKJ23P8kocvJHQ
      const res = await fetchWithTimeout(frameUrl, { method: 'HEAD' })
      const hasGifFrame = res.headers.get('Content-Type')?.includes('gif')
      if (hasGifFrame) {
        gifUrl = frameUrl
        // frame url for the gif is computed later in the collectibles page
        frameUrl = null
      }
    } else if (isAssetVideo(asset)) {
      mediaType = CollectibleMediaType.VIDEO
      frameUrl =
        imageUrls.find(
          (url) =>
            url && NON_IMAGE_EXTENSIONS.every((ext) => !url.endsWith(ext))
        ) ?? null

      /**
       * make sure frame url is not a video or a gif
       * if it is, unset frame url so that component will use a video url frame instead
       */
      if (frameUrl) {
        const res = await fetchWithTimeout(frameUrl, { method: 'HEAD' })
        const isVideo = res.headers.get('Content-Type')?.includes('video')
        const isGif = res.headers.get('Content-Type')?.includes('gif')
        if (isVideo || isGif) {
          frameUrl = null
        }
      }

      videoUrl = [animation_url, animation_original_url, ...imageUrls].find(
        (url) =>
          url && SUPPORTED_VIDEO_EXTENSIONS.some((ext) => url.endsWith(ext))
      )!
    } else if (ipfsProtocolUrl) {
      try {
        const metadataUrl = getIpfsMetadataUrl(ipfsProtocolUrl)
        const res = await fetchWithTimeout(metadataUrl, { method: 'HEAD' })
        const isGif = res.headers.get('Content-Type')?.includes('gif')
        const isVideo = res.headers.get('Content-Type')?.includes('video')
        const isAudio = res.headers.get('Content-Type')?.includes('audio')
        const isWebp = res.headers.get('Content-Type')?.includes('webp')
        let isAnimatedWebp = false
        if (isWebp) {
          const ab = await res.arrayBuffer()
          isAnimatedWebp = isWebpAnimated(ab)
        }
        if (res.status >= 300) {
          mediaType = CollectibleMediaType.IMAGE
          imageUrl = placeholderCoverArt as string
          frameUrl = placeholderCoverArt as string
        } else if (isAnimatedWebp) {
          mediaType = CollectibleMediaType.ANIMATED_WEBP
          gifUrl = frameUrl
          // frame url for the animated webp is computed later in the collectibles page
          frameUrl = null
        } else if (isGif) {
          mediaType = CollectibleMediaType.GIF
          frameUrl = null
          gifUrl = metadataUrl
        } else if (isVideo) {
          mediaType = CollectibleMediaType.VIDEO
          frameUrl = null
          videoUrl = metadataUrl
        } else {
          mediaType = CollectibleMediaType.IMAGE
          imageUrl = imageUrls.find((url) => !!url)!
          if (imageUrl.startsWith(ipfsProtocolPrefix)) {
            imageUrl = getIpfsMetadataUrl(imageUrl)
          }
          frameUrl = imageUrl
          if (isAudio) {
            hasAudio = true
            animationUrlOverride = metadataUrl
          }
        }
      } catch (e) {
        console.error(
          `Could not fetch url metadata at ${ipfsProtocolUrl} for asset contract address ${asset.contract} and asset token id ${asset.token_id}`
        )
        mediaType = CollectibleMediaType.IMAGE
        frameUrl = imageUrls.find((url) => !!url)!
        if (frameUrl.startsWith(ipfsProtocolPrefix)) {
          frameUrl = getIpfsMetadataUrl(frameUrl)
        }
        imageUrl = frameUrl
      }
    } else if (arweaveProtocolUrl) {
      try {
        const metadataUrl = getArweaveMetadataUrl(arweaveProtocolUrl)
        const res = await fetchWithTimeout(metadataUrl, { method: 'HEAD' })
        const isGif = res.headers.get('Content-Type')?.includes('gif')
        const isVideo = res.headers.get('Content-Type')?.includes('video')
        const isAudio = res.headers.get('Content-Type')?.includes('audio')
        const isWebp = res.headers.get('Content-Type')?.includes('webp')
        let isAnimatedWebp = false
        if (isWebp) {
          const ab = await res.arrayBuffer()
          isAnimatedWebp = isWebpAnimated(ab)
        }
        if (res.status >= 300) {
          mediaType = CollectibleMediaType.IMAGE
          imageUrl = placeholderCoverArt as string
          frameUrl = placeholderCoverArt as string
        } else if (isAnimatedWebp) {
          mediaType = CollectibleMediaType.ANIMATED_WEBP
          gifUrl = frameUrl
          // frame url for the animated webp is computed later in the collectibles page
          frameUrl = null
        } else if (isGif) {
          mediaType = CollectibleMediaType.GIF
          frameUrl = null
          gifUrl = metadataUrl
        } else if (isVideo) {
          mediaType = CollectibleMediaType.VIDEO
          frameUrl = null
          videoUrl = metadataUrl
        } else {
          mediaType = CollectibleMediaType.IMAGE
          imageUrl = imageUrls.find((url) => !!url)!
          if (imageUrl.startsWith(arweavePrefix)) {
            imageUrl = getArweaveMetadataUrl(imageUrl)
          }
          frameUrl = imageUrl
          if (isAudio) {
            hasAudio = true
            animationUrlOverride = metadataUrl
          }
        }
      } catch (e) {
        console.error(
          `Could not fetch url metadata at ${arweaveProtocolUrl} for asset contract address ${asset.contract} and asset token id ${asset.token_id}`
        )
        mediaType = CollectibleMediaType.IMAGE
        frameUrl = imageUrls.find((url) => !!url)!
        imageUrl = frameUrl
      }
    } else {
      frameUrl = imageUrls.find((url) => !!url)!
      const res = await fetchWithTimeout(frameUrl, {
        headers: { Range: 'bytes=0-100' }
      })
      const isGif = res.headers.get('Content-Type')?.includes('gif')
      const isVideo = res.headers.get('Content-Type')?.includes('video')
      const isWebp = res.headers.get('Content-Type')?.includes('webp')
      let isAnimatedWebp = false
      if (isWebp) {
        const ab = await res.arrayBuffer()
        isAnimatedWebp = isWebpAnimated(ab)
      }
      if (res.status >= 300) {
        mediaType = CollectibleMediaType.IMAGE
        imageUrl = placeholderCoverArt as string
        frameUrl = placeholderCoverArt as string
      } else if (isAnimatedWebp) {
        mediaType = CollectibleMediaType.ANIMATED_WEBP
        gifUrl = frameUrl
        // frame url for the animated webp is computed later in the collectibles page
        frameUrl = null
      } else if (isGif) {
        mediaType = CollectibleMediaType.GIF
        gifUrl = frameUrl
        // frame url for the gif is computed later in the collectibles page
        frameUrl = null
      } else if (isVideo) {
        mediaType = CollectibleMediaType.VIDEO
        frameUrl = null
        videoUrl = imageUrls.find((url) => !!url)!
      } else {
        mediaType = CollectibleMediaType.IMAGE
        imageUrl = imageUrls.find((url) => !!url)!
        frameUrl = imageUrls.find((url) => !!url)!
      }
    }
  } catch (e) {
    console.error('Error processing collectible', e)
    mediaType = CollectibleMediaType.IMAGE
    imageUrl = placeholderCoverArt as string
    frameUrl = placeholderCoverArt as string
  }

  const collectionSlug =
    typeof asset.collection === 'object'
      ? (asset.collection as unknown as any).name ?? null
      : asset.collection

  const collectible: Collectible = {
    id: getAssetIdentifier(asset),
    tokenId: asset.identifier,
    name: (asset.name || asset?.asset_contract?.name) ?? '',
    description: asset.description,
    mediaType,
    frameUrl,
    imageUrl,
    videoUrl,
    threeDUrl,
    gifUrl,
    animationUrl: animationUrlOverride ?? animation_url ?? null,
    hasAudio,
    isOwned: true,
    dateCreated: null,
    dateLastTransferred: null,
    externalLink: asset.external_url ?? null,
    permaLink: asset.opensea_url,
    assetContractAddress: asset.contract,
    standard: (asset.token_standard?.toUpperCase() as EthTokenStandard) ?? null,
    collectionSlug: collectionSlug ?? null,
    collectionName: asset.collectionMetadata?.name ?? null,
    collectionImageUrl: asset.collectionMetadata?.image_url ?? null,
    chain: 'eth',
    wallet: asset.wallet
  }
  return collectible
}

export const transferEventToCollectible = async (
  event: OpenSeaEventExtended,
  isOwned = true
): Promise<Collectible> => {
  const { nft, event_timestamp } = event

  const collectible = await assetToCollectible(nft)

  return {
    ...collectible,
    isOwned,
    dateLastTransferred: dayjs(event_timestamp * 1000).toString()
  }
}

export const isNotFromNullAddress = (event: OpenSeaEvent) => {
  return event.from_address !== NULL_ADDRESS
}
