import { Injectable } from '@nestjs/common'
import { createHash } from 'crypto'
import { Readable } from 'stream'
import { getSupabaseClient } from '@/storage/database/supabase-client'
import { AiService } from '@/ai/ai.service'
import { AsrService } from '@/asr/asr.service'
import { TosMediaStorageService } from './tos-media-storage.service'
import { WechatMediaService } from './wechat-media.service'

type WechatMessageType = 'text' | 'voice'
type RecordType = 'expense' | 'subscription'

interface PendingRecordMetadata {
  source_message_type?: WechatMessageType
  source_openid?: string
  wechat_msg_id?: string
  wechat_media_id?: string
  media_format?: string
  media_object_key?: string
  media_content_type?: string
  media_size?: number
  transcription_source?: 'text' | 'wechat_recognition' | 'asr' | 'unavailable'
  source_payload?: Record<string, unknown>
  media_expires_at?: string
}

interface PendingMedia {
  stream: Readable
  contentType: string
  contentLength?: number
}

@Injectable()
export class WechatService {
  private readonly supabase = getSupabaseClient()
  private readonly token = process.env.WECHAT_OA_TOKEN || 'coze_bookkeeping_token'

  constructor(
    private readonly aiService: AiService,
    private readonly asrService: AsrService,
    private readonly wechatMediaService: WechatMediaService,
    private readonly tosMediaStorageService: TosMediaStorageService,
  ) {}

  verifySignature(signature: string, timestamp: string, nonce: string): boolean {
    const arr = [this.token, timestamp, nonce].sort()
    const sha1 = createHash('sha1').update(arr.join('')).digest('hex')
    return sha1 === signature
  }

  parseXml(xml: string): Record<string, string> {
    const result: Record<string, string> = {}
    const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(xml)) !== null) {
      const key = match[1] || match[3]
      const value = match[2] || match[4]
      if (key && value) {
        result[key] = value
      }
    }
    return result
  }

  buildTextReply(toUser: string, fromUser: string, content: string): string {
    return `<xml>
  <ToUserName><![CDATA[${toUser}]]></ToUserName>
  <FromUserName><![CDATA[${fromUser}]]></FromUserName>
  <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${content}]]></Content>
</xml>`
  }

  async handleMessage(xml: string): Promise<string> {
    const msg = this.parseXml(xml)
    const openid = msg['FromUserName']
    const developerId = msg['ToUserName']
    const msgType = msg['MsgType'] || 'text'

    console.log('WechatService.handleMessage:', { openid, msgType })

    if (!openid || !developerId) {
      return this.buildTextReply(openid || '', developerId || '', '消息格式错误，请重试')
    }

    if (msgType === 'text') {
      return await this.handleTextMessage(msg, openid, developerId)
    }

    if (msgType === 'voice') {
      return await this.handleVoiceMessage(msg, openid, developerId)
    }

    return this.buildTextReply(openid, developerId, '暂时只支持发送文字或语音记账。')
  }

  private async handleTextMessage(msg: Record<string, string>, openid: string, developerId: string): Promise<string> {
    const content = (msg['Content'] || '').trim()
    if (!content) {
      return this.buildTextReply(openid, developerId, '消息格式错误，请重试')
    }

    const bindMatch = content.match(/^绑定\s+(\S+)/)
    if (bindMatch) {
      return await this.handleBind(openid, bindMatch[1], developerId)
    }

    const binding = await this.getBinding(openid)
    if (!binding) {
      return this.buildTextReply(openid, developerId, this.buildUnboundReply())
    }

    return await this.handleAccountingMessage(binding.user_id, openid, content, developerId, {
      source_message_type: 'text',
      source_openid: openid,
      wechat_msg_id: msg['MsgId'],
      transcription_source: 'text',
      source_payload: {
        msg_type: msg['MsgType'],
        content,
      },
    })
  }

  private async handleVoiceMessage(msg: Record<string, string>, openid: string, developerId: string): Promise<string> {
    const binding = await this.getBinding(openid)
    if (!binding) {
      return this.buildTextReply(openid, developerId, this.buildUnboundReply())
    }

    const mediaId = msg['MediaId'] || ''
    const mediaFormat = msg['Format'] || 'amr'
    const recognition = (msg['Recognition'] || '').trim()
    const sourcePayload: Record<string, unknown> = {
      msg_type: msg['MsgType'],
      recognition,
      format: mediaFormat,
    }

    let transcript = recognition
    let transcriptionSource: PendingRecordMetadata['transcription_source'] = recognition ? 'wechat_recognition' : 'unavailable'
    let voiceBuffer: Buffer | null = null
    let mediaContentType = ''
    let mediaObjectKey: string | undefined
    let mediaSize: number | undefined
    let downloadError: string | undefined
    let uploadError: string | undefined
    let asrError: string | undefined

    if (mediaId) {
      try {
        const media = await this.wechatMediaService.downloadTemporaryMedia(mediaId)
        voiceBuffer = media.buffer
        mediaContentType = media.contentType
      } catch (error) {
        downloadError = this.getErrorMessage(error)
        console.error('WechatService.handleVoiceMessage download error:', error)
      }
    }

    if (voiceBuffer) {
      try {
        const stored = await this.tosMediaStorageService.uploadWechatVoice({
          buffer: voiceBuffer,
          contentType: mediaContentType,
          format: mediaFormat,
          mediaId,
          openid,
        })
        mediaObjectKey = stored.objectKey
        mediaContentType = stored.contentType
        mediaSize = stored.size
      } catch (error) {
        uploadError = this.getErrorMessage(error)
        console.error('WechatService.handleVoiceMessage upload error:', error)
      }

      if (!transcript) {
        try {
          const result = await this.asrService.recognize(voiceBuffer)
          transcript = (result.text || '').trim()
          if (transcript) {
            transcriptionSource = 'asr'
          }
        } catch (error) {
          asrError = this.getErrorMessage(error)
          console.error('WechatService.handleVoiceMessage asr error:', error)
        }
      }
    }

    const metadata: PendingRecordMetadata = {
      source_message_type: 'voice',
      source_openid: openid,
      wechat_msg_id: msg['MsgId'],
      wechat_media_id: mediaId,
      media_format: mediaFormat,
      media_object_key: mediaObjectKey,
      media_content_type: mediaContentType || undefined,
      media_size: mediaSize,
      transcription_source: transcriptionSource,
      media_expires_at: this.getWechatMediaExpiresAt(),
      source_payload: {
        ...sourcePayload,
        download_error: downloadError,
        upload_error: uploadError,
        asr_error: asrError,
      },
    }

    if (!transcript) {
      await this.createPendingRecord(
        binding.user_id,
        '[语音消息] 未能识别出文字',
        'expense',
        {
          transcription_error: asrError || downloadError || '未获取到可识别的语音文本',
          media_status: mediaObjectKey ? 'stored' : 'missing',
        },
        'wechat_oa',
        metadata,
      )
      return this.buildTextReply(openid, developerId, '已收到语音，但还没能识别出文字。已放入小程序待确认，请打开小程序补充。')
    }

    return await this.handleAccountingMessage(binding.user_id, openid, transcript, developerId, metadata)
  }

  private async handleAccountingMessage(
    userId: string,
    openid: string,
    text: string,
    developerId: string,
    metadata: PendingRecordMetadata,
  ): Promise<string> {
    const isSubscription = /每月|每季|每年|月付|季付|年付|订阅|续费|会员/.test(text)

    try {
      if (isSubscription) {
        return await this.handleSubscriptionMessage(userId, openid, text, developerId, metadata)
      }
      return await this.handleExpenseMessage(userId, openid, text, developerId, metadata)
    } catch (err) {
      console.error('WechatService.handleAccountingMessage error:', err)
      return this.buildTextReply(openid, developerId, '处理失败，请稍后重试或直接在小程序中记账')
    }
  }

  private async handleBind(openid: string, code: string, developerId: string): Promise<string> {
    const existing = await this.getBinding(openid)
    if (existing) {
      return this.buildTextReply(openid, developerId, '您已绑定，无需重复操作。直接发送消费内容即可记账！')
    }

    const { data, error } = await this.supabase
      .from('wechat_bindings')
      .select('*')
      .eq('binding_code', code)
      .eq('is_active', true)
      .single()

    if (error || !data) {
      return this.buildTextReply(openid, developerId, '绑定码无效，请检查后重试。可在小程序「我的」页面重新获取绑定码。')
    }

    const { error: updateError } = await this.supabase
      .from('wechat_bindings')
      .update({ wechat_openid: openid, updated_at: new Date().toISOString() })
      .eq('id', data.id)

    if (updateError) {
      console.error('WechatService.handleBind update error:', updateError)
      return this.buildTextReply(openid, developerId, '绑定失败，请稍后重试')
    }

    return this.buildTextReply(
      openid,
      developerId,
      '绑定成功！以后直接发文字或语音即可记账。\n\n记一笔：午饭25元\n记订阅：每月腾讯视频25元\n\n记录会先存为待确认，请到小程序中确认即可。',
    )
  }

  private async handleExpenseMessage(
    userId: string,
    openid: string,
    text: string,
    developerId: string,
    metadata: PendingRecordMetadata,
  ): Promise<string> {
    const results = await this.aiService.parseExpense(text, userId, new Date().toISOString().slice(0, 10))
    console.log('WechatService.handleExpenseMessage parsed:', JSON.stringify(results))

    if (!results || results.length === 0) {
      await this.createPendingRecord(userId, text, 'expense', {}, 'wechat_oa', metadata)
      return this.buildTextReply(openid, developerId, `已收到「${text}」，但未能自动识别，请到小程序中手动补充。`)
    }

    const savedItems: string[] = []
    for (const item of results) {
      await this.createPendingRecord(userId, text, 'expense', item, 'wechat_oa', metadata)
      const amountStr = item.amount != null ? `¥${item.amount}` : '金额待确认'
      savedItems.push(`${item.note || item.category || '支出'} ${amountStr} (${item.category || '未分类'})`)
    }

    const replyContent = `已记录 ${savedItems.length} 笔支出：\n${savedItems.join('\n')}\n\n请到小程序中确认记录是否正确。`
    return this.buildTextReply(openid, developerId, replyContent)
  }

  private async handleSubscriptionMessage(
    userId: string,
    openid: string,
    text: string,
    developerId: string,
    metadata: PendingRecordMetadata,
  ): Promise<string> {
    const results = await this.aiService.parseSubscription(text, userId)
    console.log('WechatService.handleSubscriptionMessage parsed:', JSON.stringify(results))

    if (!results || results.length === 0) {
      await this.createPendingRecord(userId, text, 'subscription', {}, 'wechat_oa', metadata)
      return this.buildTextReply(openid, developerId, `已收到「${text}」，但未能自动识别订阅信息，请到小程序中手动补充。`)
    }

    const savedItems: string[] = []
    const cycleLabels: Record<string, string> = { monthly: '每月', quarterly: '每季度', yearly: '每年' }
    for (const item of results) {
      await this.createPendingRecord(userId, text, 'subscription', item, 'wechat_oa', metadata)
      const amountStr = item.amount != null ? `¥${item.amount}` : '金额待确认'
      savedItems.push(`${item.name || '订阅'} ${amountStr}/${cycleLabels[item.cycle] || item.cycle}`)
    }

    const replyContent = `已记录 ${savedItems.length} 项订阅：\n${savedItems.join('\n')}\n\n请到小程序中确认记录是否正确。`
    return this.buildTextReply(openid, developerId, replyContent)
  }

  async getBinding(openid: string): Promise<{ id: string; user_id: string } | null> {
    const { data, error } = await this.supabase
      .from('wechat_bindings')
      .select('id, user_id')
      .eq('wechat_openid', openid)
      .eq('is_active', true)
      .single()

    if (error || !data) return null
    return data
  }

  async generateBindingCode(userId: string): Promise<string> {
    const { data: existing } = await this.supabase
      .from('wechat_bindings')
      .select('id, binding_code, wechat_openid')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (existing) {
      if (existing.wechat_openid && existing.wechat_openid !== '') {
        return 'ALREADY_BOUND'
      }
      if (existing.binding_code) {
        return existing.binding_code
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))

    if (existing) {
      await this.supabase
        .from('wechat_bindings')
        .update({ binding_code: code, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await this.supabase
        .from('wechat_bindings')
        .insert({
          user_id: userId,
          wechat_openid: '',
          binding_code: code,
          is_active: true,
        })
    }

    return code
  }

  async getBindingStatus(userId: string): Promise<{ bound: boolean; openid?: string }> {
    const { data, error } = await this.supabase
      .from('wechat_bindings')
      .select('wechat_openid')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (error || !data) return { bound: false }
    const bound = !!(data.wechat_openid && data.wechat_openid !== '')
    return { bound, openid: data.wechat_openid }
  }

  async createPendingRecord(
    userId: string,
    rawText: string,
    recordType: RecordType,
    parsedData: Record<string, unknown>,
    source = 'wechat_oa',
    metadata: PendingRecordMetadata = {},
  ): Promise<void> {
    const insertPayload = this.buildPendingInsertPayload(userId, rawText, recordType, parsedData, source, metadata)
    const { error } = await this.supabase
      .from('pending_records')
      .insert(insertPayload)

    if (error) {
      if (this.isMissingPendingMediaColumnError(error)) {
        const { error: fallbackError } = await this.supabase
          .from('pending_records')
          .insert(this.buildLegacyPendingInsertPayload(userId, rawText, recordType, parsedData, source, metadata))

        if (!fallbackError) return

        console.error('WechatService.createPendingRecord legacy fallback error:', fallbackError)
      }
      console.error('WechatService.createPendingRecord error:', error)
      throw new Error('创建待确认记录失败')
    }
  }

  async getPendingRecords(userId: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await this.supabase
      .from('pending_records')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('WechatService.getPendingRecords error:', error)
      throw new Error('获取待确认记录失败')
    }
    return data || []
  }

  async getPendingRecordMedia(id: string, userId: string): Promise<PendingMedia> {
    const { data, error } = await this.supabase
      .from('pending_records')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      throw new Error('待确认记录不存在')
    }

    const fallbackMedia = data.parsed_data?._source_media || {}
    const mediaObjectKey = data.media_object_key || fallbackMedia.media_object_key
    const mediaContentType = data.media_content_type || fallbackMedia.media_content_type

    if (!mediaObjectKey) {
      throw new Error('该记录没有可回听的语音')
    }

    const media = await this.tosMediaStorageService.getMediaStream(mediaObjectKey)
    return {
      stream: media.stream,
      contentType: mediaContentType || media.contentType,
      contentLength: media.contentLength,
    }
  }

  async confirmPendingRecord(id: string, userId: string): Promise<Record<string, unknown>> {
    const { data, error } = await this.supabase
      .from('pending_records')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single()

    if (error || !data) {
      throw new Error('待确认记录不存在或已处理')
    }

    const { error: updateError } = await this.supabase
      .from('pending_records')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) {
      console.error('WechatService.confirmPendingRecord error:', updateError)
      throw new Error('确认记录失败')
    }

    return data
  }

  async rejectPendingRecord(id: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('pending_records')
      .update({ status: 'rejected', confirmed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('status', 'pending')

    if (error) {
      console.error('WechatService.rejectPendingRecord error:', error)
      throw new Error('拒绝记录失败')
    }
  }

  async getPendingCount(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('pending_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending')

    if (error) {
      console.error('WechatService.getPendingCount error:', error)
      return 0
    }
    return count || 0
  }

  private buildUnboundReply(): string {
    return '您还未绑定记账小程序。\n\n请按以下步骤操作：\n1. 打开记账小程序\n2. 进入「我的」页面\n3. 点击「微信绑定」获取绑定码\n4. 回到这里发送「绑定 您的绑定码」\n\n例如：绑定 123456'
  }

  private getWechatMediaExpiresAt(): string {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    return expiresAt.toISOString()
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private buildPendingInsertPayload(
    userId: string,
    rawText: string,
    recordType: RecordType,
    parsedData: Record<string, unknown>,
    source: string,
    metadata: PendingRecordMetadata,
  ): Record<string, unknown> {
    return this.compactObject({
      user_id: userId,
      source,
      raw_text: rawText,
      record_type: recordType,
      parsed_data: this.withSourceMediaFallback(parsedData, metadata),
      status: 'pending',
      source_message_type: metadata.source_message_type,
      source_openid: metadata.source_openid,
      wechat_msg_id: metadata.wechat_msg_id,
      wechat_media_id: metadata.wechat_media_id,
      media_format: metadata.media_format,
      media_object_key: metadata.media_object_key,
      media_content_type: metadata.media_content_type,
      media_size: metadata.media_size,
      transcription_source: metadata.transcription_source,
      source_payload: metadata.source_payload,
      media_expires_at: metadata.media_expires_at,
    })
  }

  private buildLegacyPendingInsertPayload(
    userId: string,
    rawText: string,
    recordType: RecordType,
    parsedData: Record<string, unknown>,
    source: string,
    metadata: PendingRecordMetadata,
  ): Record<string, unknown> {
    return {
      user_id: userId,
      source,
      raw_text: rawText,
      record_type: recordType,
      parsed_data: this.withSourceMediaFallback(parsedData, metadata),
      status: 'pending',
    }
  }

  private withSourceMediaFallback(parsedData: Record<string, unknown>, metadata: PendingRecordMetadata): Record<string, unknown> {
    if (!metadata.source_message_type && !metadata.media_object_key && !metadata.wechat_media_id) {
      return parsedData
    }

    return {
      ...parsedData,
      _source_media: this.compactObject({
        source_message_type: metadata.source_message_type,
        source_openid: metadata.source_openid,
        wechat_msg_id: metadata.wechat_msg_id,
        wechat_media_id: metadata.wechat_media_id,
        media_format: metadata.media_format,
        media_object_key: metadata.media_object_key,
        media_content_type: metadata.media_content_type,
        media_size: metadata.media_size,
        transcription_source: metadata.transcription_source,
        source_payload: metadata.source_payload,
        media_expires_at: metadata.media_expires_at,
      }),
    }
  }

  private isMissingPendingMediaColumnError(error: { code?: string; message?: string; details?: string }): boolean {
    const text = `${error.code || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase()
    return text.includes('pgrst204') ||
      text.includes('42703') ||
      text.includes('could not find') ||
      (text.includes('column') && text.includes('pending_records'))
  }

  private compactObject<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    ) as T
  }
}
