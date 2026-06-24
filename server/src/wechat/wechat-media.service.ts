import { Injectable } from '@nestjs/common'

interface WechatAccessTokenResponse {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

export interface DownloadedWechatMedia {
  buffer: Buffer
  contentType: string
}

@Injectable()
export class WechatMediaService {
  private accessToken: string | null = null
  private accessTokenExpiresAt = 0

  private get appId(): string {
    return process.env.WECHAT_OA_APP_ID || ''
  }

  private get appSecret(): string {
    return process.env.WECHAT_OA_APP_SECRET || ''
  }

  async downloadTemporaryMedia(mediaId: string): Promise<DownloadedWechatMedia> {
    if (!mediaId) {
      throw new Error('Missing WeChat media id')
    }

    const token = await this.getAccessToken()
    const url = new URL('https://api.weixin.qq.com/cgi-bin/media/get')
    url.searchParams.set('access_token', token)
    url.searchParams.set('media_id', mediaId)

    const response = await fetch(url)
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const body = Buffer.from(await response.arrayBuffer())

    if (!response.ok || contentType.includes('application/json')) {
      const errorText = body.toString('utf8')
      throw new Error(`Failed to download WeChat media: ${errorText || response.statusText}`)
    }

    return { buffer: body, contentType }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken
    }

    if (!this.appId || !this.appSecret) {
      throw new Error('WECHAT_OA_APP_ID and WECHAT_OA_APP_SECRET are required to download voice media')
    }

    const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
    url.searchParams.set('grant_type', 'client_credential')
    url.searchParams.set('appid', this.appId)
    url.searchParams.set('secret', this.appSecret)

    const response = await fetch(url)
    const data = await response.json() as WechatAccessTokenResponse

    if (!response.ok || !data.access_token) {
      throw new Error(`Failed to fetch WeChat access token: ${data.errmsg || response.statusText}`)
    }

    const expiresInMs = Math.max((data.expires_in || 7200) - 300, 60) * 1000
    this.accessToken = data.access_token
    this.accessTokenExpiresAt = Date.now() + expiresInMs
    return data.access_token
  }
}
