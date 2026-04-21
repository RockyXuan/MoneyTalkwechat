import { Injectable } from '@nestjs/common'
import { createHash } from 'crypto'
import { getSupabaseClient } from '@/storage/database/supabase-client'
import { AiService } from '@/ai/ai.service'

@Injectable()
export class WechatService {
  private readonly supabase = getSupabaseClient()
  private readonly token = process.env.WECHAT_OA_TOKEN || 'coze_bookkeeping_token'

  constructor(private readonly aiService: AiService) {}

  /**
   * Verify WeChat webhook signature (GET request)
   */
  verifySignature(signature: string, timestamp: string, nonce: string): boolean {
    const arr = [this.token, timestamp, nonce].sort()
    const sha1 = createHash('sha1').update(arr.join('')).digest('hex')
    return sha1 === signature
  }

  /**
   * Parse WeChat XML message body
   */
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

  /**
   * Build WeChat XML reply
   */
  buildTextReply(toUser: string, fromUser: string, content: string): string {
    return `<xml>
  <ToUserName><![CDATA[${toUser}]]></ToUserName>
  <FromUserName><![CDATA[${fromUser}]]></FromUserName>
  <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${content}]]></Content>
</xml>`
  }

  /**
   * Handle incoming WeChat message
   */
  async handleMessage(xml: string): Promise<string> {
    const msg = this.parseXml(xml)
    const openid = msg['FromUserName']
    const content = (msg['Content'] || '').trim()
    const developerId = msg['ToUserName']

    console.log('WechatService.handleMessage:', { openid, content })

    if (!openid || !content) {
      return this.buildTextReply(openid, developerId, '消息格式错误，请重试')
    }

    // Check if it's a binding command
    const bindMatch = content.match(/^绑定\s+(\S+)/)
    if (bindMatch) {
      return await this.handleBind(openid, bindMatch[1], developerId)
    }

    // Check if user is bound
    const binding = await this.getBinding(openid)
    if (!binding) {
      return this.buildTextReply(
        openid,
        developerId,
        '您还未绑定记账小程序。\n\n请按以下步骤操作：\n1. 打开记账小程序\n2. 进入「我的」页面\n3. 点击「微信绑定」获取绑定码\n4. 回到这里发送「绑定 您的绑定码」\n\n例如：绑定 123456',
      )
    }

    // Determine if it's a subscription or expense
    const isSubscription = /每月|每季|每年|月付|季付|年付|订阅|续费|会员/.test(content)

    try {
      if (isSubscription) {
        return await this.handleSubscriptionMessage(binding.user_id, openid, content, developerId)
      } else {
        return await this.handleExpenseMessage(binding.user_id, openid, content, developerId)
      }
    } catch (err) {
      console.error('WechatService.handleMessage error:', err)
      return this.buildTextReply(openid, developerId, '处理失败，请稍后重试或直接在小程序中记账')
    }
  }

  /**
   * Handle binding command
   */
  private async handleBind(openid: string, code: string, developerId: string): Promise<string> {
    // Check if already bound
    const existing = await this.getBinding(openid)
    if (existing) {
      return this.buildTextReply(openid, developerId, '您已绑定，无需重复操作。直接发送消费内容即可记账！')
    }

    // Look up binding code
    const { data, error } = await this.supabase
      .from('wechat_bindings')
      .select('*')
      .eq('binding_code', code)
      .eq('is_active', true)
      .single()

    if (error || !data) {
      return this.buildTextReply(openid, developerId, '绑定码无效，请检查后重试。可在小程序「我的」页面重新获取绑定码。')
    }

    // Update binding with openid
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
      '绑定成功！以后直接发消息即可记账。\n\n记一笔：午饭25元\n记订阅：每月腾讯视频25元\n\n记录会先存为待确认，请到小程序中确认即可。',
    )
  }

  /**
   * Handle expense message
   */
  private async handleExpenseMessage(userId: string, openid: string, text: string, developerId: string): Promise<string> {
    const results = await this.aiService.parseExpense(text, userId, new Date().toISOString().slice(0, 10))
    console.log('WechatService.handleExpenseMessage parsed:', JSON.stringify(results))

    if (!results || results.length === 0) {
      // Save as raw pending record
      await this.createPendingRecord(userId, text, 'expense', {})
      return this.buildTextReply(openid, developerId, `已收到"${text}"，但未能自动识别，请到小程序中手动补充。`)
    }

    // Save each parsed result as pending record
    const savedItems: string[] = []
    for (const item of results) {
      await this.createPendingRecord(userId, text, 'expense', item)
      const amountStr = item.amount != null ? `¥${item.amount}` : '金额待确认'
      savedItems.push(`${item.note || item.category || '支出'} ${amountStr} (${item.category || '未分类'})`)
    }

    const replyContent = `已记录 ${savedItems.length} 笔支出：\n${savedItems.join('\n')}\n\n请到小程序中确认记录是否正确。`
    return this.buildTextReply(openid, developerId, replyContent)
  }

  /**
   * Handle subscription message
   */
  private async handleSubscriptionMessage(userId: string, openid: string, text: string, developerId: string): Promise<string> {
    const results = await this.aiService.parseSubscription(text, userId)
    console.log('WechatService.handleSubscriptionMessage parsed:', JSON.stringify(results))

    if (!results || results.length === 0) {
      await this.createPendingRecord(userId, text, 'subscription', {})
      return this.buildTextReply(openid, developerId, `已收到"${text}"，但未能自动识别订阅信息，请到小程序中手动补充。`)
    }

    const savedItems: string[] = []
    const cycleLabels: Record<string, string> = { monthly: '每月', quarterly: '每季度', yearly: '每年' }
    for (const item of results) {
      await this.createPendingRecord(userId, text, 'subscription', item)
      const amountStr = item.amount != null ? `¥${item.amount}` : '金额待确认'
      savedItems.push(`${item.name || '订阅'} ${amountStr}/${cycleLabels[item.cycle] || item.cycle}`)
    }

    const replyContent = `已记录 ${savedItems.length} 项订阅：\n${savedItems.join('\n')}\n\n请到小程序中确认记录是否正确。`
    return this.buildTextReply(openid, developerId, replyContent)
  }

  /**
   * Get binding by openid
   */
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

  /**
   * Generate a binding code for a user
   */
  async generateBindingCode(userId: string): Promise<string> {
    // Check if user already has a binding code
    const { data: existing } = await this.supabase
      .from('wechat_bindings')
      .select('id, binding_code, wechat_openid')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (existing) {
      // If already bound (has openid), return status
      if (existing.wechat_openid && existing.wechat_openid !== '') {
        return 'ALREADY_BOUND'
      }
      // Return existing code
      if (existing.binding_code) {
        return existing.binding_code
      }
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000))

    if (existing) {
      // Update existing record with new code
      await this.supabase
        .from('wechat_bindings')
        .update({ binding_code: code, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      // Create new binding record
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

  /**
   * Get binding status for a user
   */
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

  /**
   * Create a pending record
   */
  async createPendingRecord(userId: string, rawText: string, recordType: string, parsedData: any): Promise<void> {
    const { error } = await this.supabase
      .from('pending_records')
      .insert({
        user_id: userId,
        source: 'wechat_oa',
        raw_text: rawText,
        record_type: recordType,
        parsed_data: parsedData,
        status: 'pending',
      })

    if (error) {
      console.error('WechatService.createPendingRecord error:', error)
      throw new Error('创建待确认记录失败')
    }
  }

  /**
   * Get pending records for a user
   */
  async getPendingRecords(userId: string): Promise<any[]> {
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

  /**
   * Confirm a pending record - returns the parsed data so the frontend can create the actual record
   */
  async confirmPendingRecord(id: string, userId: string): Promise<any> {
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

  /**
   * Reject a pending record
   */
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

  /**
   * Get pending record count for a user
   */
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
}
