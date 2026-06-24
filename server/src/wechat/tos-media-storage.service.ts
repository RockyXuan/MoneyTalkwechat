import { Injectable } from '@nestjs/common'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Readable } from 'stream'

interface StoredVoiceMedia {
  objectKey: string
  contentType: string
  size: number
}

interface VoiceUploadInput {
  buffer: Buffer
  contentType: string
  format?: string
  mediaId: string
  openid: string
}

export interface StoredMediaStream {
  stream: Readable
  contentType: string
  contentLength?: number
}

@Injectable()
export class TosMediaStorageService {
  private client: S3Client | null = null

  async uploadWechatVoice(input: VoiceUploadInput): Promise<StoredVoiceMedia> {
    const bucket = this.requireBucket()
    const objectKey = this.buildObjectKey(input)
    const contentType = this.resolveContentType(input.contentType, input.format)

    await this.getClient().send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: input.buffer,
      ContentType: contentType,
      Metadata: {
        wechat_media_id: input.mediaId,
        wechat_openid: input.openid,
      },
    }))

    return {
      objectKey,
      contentType,
      size: input.buffer.length,
    }
  }

  async getMediaStream(objectKey: string): Promise<StoredMediaStream> {
    const bucket = this.requireBucket()
    const result = await this.getClient().send(new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }))

    if (!(result.Body instanceof Readable)) {
      throw new Error('Stored media body is not a readable stream')
    }

    return {
      stream: result.Body,
      contentType: result.ContentType || 'application/octet-stream',
      contentLength: result.ContentLength,
    }
  }

  private getClient(): S3Client {
    if (this.client) return this.client

    const endpoint = process.env.TOS_ENDPOINT
    const region = process.env.TOS_REGION || 'auto'
    const accessKeyId = process.env.TOS_ACCESS_KEY_ID
    const secretAccessKey = process.env.TOS_SECRET_ACCESS_KEY

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('TOS_ENDPOINT, TOS_ACCESS_KEY_ID and TOS_SECRET_ACCESS_KEY are required')
    }

    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: process.env.TOS_FORCE_PATH_STYLE !== 'false',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })

    return this.client
  }

  private requireBucket(): string {
    const bucket = process.env.TOS_BUCKET
    if (!bucket) {
      throw new Error('TOS_BUCKET is required')
    }
    return bucket
  }

  private buildObjectKey(input: VoiceUploadInput): string {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const extension = this.resolveExtension(input.format, input.contentType)
    const openid = this.safeSegment(input.openid)
    const mediaId = this.safeSegment(input.mediaId)
    return `wechat-voice/${year}/${month}/${openid}-${Date.now()}-${mediaId}.${extension}`
  }

  private resolveContentType(contentType: string, format?: string): string {
    if (contentType && !contentType.includes('application/octet-stream')) {
      return contentType
    }
    const normalized = (format || '').toLowerCase()
    if (normalized === 'amr') return 'audio/amr'
    if (normalized === 'speex') return 'audio/speex'
    if (normalized === 'mp3') return 'audio/mpeg'
    if (normalized === 'wav') return 'audio/wav'
    return 'application/octet-stream'
  }

  private resolveExtension(format?: string, contentType?: string): string {
    const normalized = (format || '').toLowerCase()
    if (normalized) return normalized.replace(/[^a-z0-9]/g, '') || 'audio'
    if (contentType?.includes('mpeg')) return 'mp3'
    if (contentType?.includes('wav')) return 'wav'
    if (contentType?.includes('amr')) return 'amr'
    return 'audio'
  }

  private safeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'unknown'
  }
}
